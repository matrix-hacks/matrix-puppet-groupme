const debug = require('debug')('matrix-puppet:groupme:client');
const WebSocket = require('ws');
const EventEmitter = require('events').EventEmitter;
const { get, post } = require('axios');
const Promise = require('bluebird');

const baseURL = 'https://api.groupme.com/v3';

const resolveData = ({data:{response}}) => {
  return Promise.resolve(response);
};

// https://dev.groupme.com/docs/v3
class RestClient {
  constructor(token) {
    this.token = token;
  }
  url(resource) {
    return `${baseURL}/${resource}?token=${this.token}`;
  }
  getMe() {
    return get(this.url('users/me')).then(resolveData);
  }
  showGroup(id) {
    return get(this.url(`groups/${id}`)).then(resolveData);
  }
  getGroups() {
    return get(this.url('groups')).then(resolveData);
  }
  getChats() {
    return get(this.url('chats')).then(resolveData);
  }
  getGroupMessages(id) {
    return get(this.url(`groups/${id}/messages`)).then(resolveData);
  }
  // TODO Attachment support
  // https://dev.groupme.com/docs/v3#messages_create
  sendGroupMessage(id) {
    let source_guid = Math.random().toString(16).substring(2);
    let url = this.url(`groups/${id}/messages`);
    return (text) => post(url, {
      message: { source_guid, text }
    });
  }
  sendDirectMessage(recipient_id) {
    let source_guid = Math.random().toString(16).substring(2);
    let url = this.url(`direct_messages`);
    return (text) => post(url, {
      direct_message: { recipient_id, source_guid, text }
    });
  }
}

class Subscription extends EventEmitter {
  constructor(client, channel) {
    super();
    this.client = client;
    this.channel = channel;
  }
  handleMessage(msg) {
    const { id, data } = msg;
    if ( data ) {
      if ( data.type ) {
        this.emit(data.type, data);
      }
      if ( id ) {
        this.emit('reply:'+id, data);
      }
    }
  }
  send(data, timeout=30000) {
    const now = () => new Date().getTime();
    const start = now();
    return new Promise((resolve, reject) => {
      setTimeout(()=>reject(new Error('timed out')), timeout);
      let id = this.client.send({
        channel: this.channel, data,
        clientId: this.client.clientId,
        ext: { access_token: this.client.token }
      });
      this.once('reply:'+id, ()=> resolve({data, time:now()-start}));
    });
  }
}

// https://dev.groupme.com/tutorials/push
class Client {
  constructor(token) {
    this.token = token;
    this.api = new RestClient(token);
    this.clientId = null;
    this.msgId = 0;
    this.ws = null;
    this.channels = {};
  }
  connect() {
    debug('creating websocket');
    this.ws = new WebSocket('wss://push.groupme.com/faye');
    debug('websocket created');
    this.ws.on('message', (jsonString, _flags) => {
      let data = JSON.parse(jsonString)[0];
      let ch = this.channels[data.channel];
      debug('got data', data);
      ch ? ch.handle(data) : debug('unhandled message', data);
    });

    this.ws.on('close', () => {
      debug('disconnected');
      this.connect();
    });

    return new Promise((resolve, _reject) => {
      this.ws.on('open', () => resolve(this._handshake()));
    });
  }
  send(msg) {
    let obj = Object.assign({}, msg, {id: ++this.msgId});
    this.ws.send(JSON.stringify(obj), (err) => {
      if (err) debug('websocket send error', err);
      else debug('websocket sent successfully', obj);
    });
    return obj.id;
  }
  _handshake() {
    return new Promise((resolve, reject) => {
      this.channels['/meta/handshake'] = {
        handle: (data) => {
          const {successful, clientId} = data;
          this.clientId = clientId;
          successful ? resolve(this) : reject(data);
        }
      };
      this.send({
        "channel":"/meta/handshake",
        "version":"1.0",
        "supportedConnectionTypes":["websocket"]
      });
    });
  }
  subscribe(subName) {
    return new Promise((resolve, reject) => {
      this.channels['/meta/subscribe'] = {
        handle: (data) => {
          const {successful} = data;
          if ( successful ) {
            const emitter = new Subscription(this, subName);
            this.channels[subName] = {
              emitter,
              handle: emitter.handleMessage.bind(emitter)
            };
            resolve(emitter);
          } else {
            reject(data);
          }
        }
      };
      this.send({
        "channel":"/meta/subscribe",
        "clientId":this.clientId,
        "subscription":subName,
        "ext":{"access_token":this.token}
      });
    });
  }
}

module.exports = Client;
