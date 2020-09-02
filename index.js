const {
  MatrixAppServiceBridge: {
    Cli, AppServiceRegistration
  },
  Puppet,
  MatrixPuppetBridgeBase
} = require("matrix-puppet-bridge");
const GroupMeClient = require('./client');
const config = require('./config.json');
const path = require('path');
const puppet = new Puppet(path.join(__dirname, './config.json' ));

const debug = require('debug')('matrix-puppet:keepalive');
const keepalive = ({ ping, reconnect }) => {
  const now = () => new Date().getTime();
  let lastPingRx = now();

  const run = () => {
    const ts = now() - lastPingRx;
    if (ts > 30000) {
      debug('time since last contact', ts, 'pinging');
      ping().then(({time}) => {
        debug('got reply in', time);
        lastPingRx = now();
        setTimeout(run, 5000);
      }).catch(()=>{
        debug('ping timeout! reconnecting', reconnect);
        reconnect();
      });
    } else if (ts > 50000) {
      debug('time since last contact', ts, 'reconnecting');
      reconnect();
    } else {
      setTimeout(run, 5000);
    }
  };

  run();
};


class App extends MatrixPuppetBridgeBase {
  getServicePrefix() {
    return "groupme";
  }
  createClient() {
    return new GroupMeClient(this.config.groupme.accessToken);
  }
  initThirdPartyClient(client) {
    this.userId = null;
    this.client = client || this.createClient();
    return this.client.connect().then(() => {
      return this.client.api.getMe();
    }).then(user => {
      this.userId = user.id;
      return this.client.subscribe(`/user/${user.id}`);
    }).then(userSub => {

      keepalive({
        ping: () => userSub.send({ type: 'ping' }, 30000),
        reconnect: () => this.initThirdPartyClient(this.client)
      });

      console.log('Subscribed to GroupMe user messages');
      userSub.on('line.create', (data) => {
        const { subject: { group_id, user_id, text, name } } = data;
        const isMe = user_id === this.userId;
        return this.handleThirdPartyRoomMessage({
          roomId: group_id,
          senderName: name,
          senderId: isMe ? undefined : user_id,
          text
        }).catch(err => {
          console.error(err.stack);
        });
      });
      userSub.on('direct_message.create', (data) => {
        const { subject: { chat_id, sender_id, text, name } } = data;
        const isMe = sender_id === this.userId;
        return this.handleThirdPartyRoomMessage({
          roomId: chat_id,
          senderName: isMe ? undefined : name,
          senderId: isMe ? undefined : sender_id,
          text
        }).catch(err => {
          console.error(err.stack);
        });
      });
    });
  }
  getThirdPartyRoomDataById(id) {
    if (this.isDirectChat(id)) {
      return this.client.api.getChats(id).then(chats=>{
        return chats.find(c=>c.last_message.conversation_id === id);
      }).then(chat=>({
        name: chat.other_user.name, topic: 'GroupMe Direct Message'
      }));
    } else {
      return this.client.api.showGroup(id).then(data=>({
        name: data.name, topic: data.description
      }));
    }
  }
  isDirectChat(id){
    return id.split('+').length > 1;
  }
  getRecipientFromDirectChatId(cid){
    return cid.split('+').filter(id => id !== this.userId)[0];
  }
  sendMessageAsPuppetToThirdPartyRoomWithId(id, text) {
    if (this.isDirectChat(id)) {
      const rid = this.getRecipientFromDirectChatId(id);
      return this.client.api.sendDirectMessage(rid)(text);
    } else {
      return this.client.api.sendGroupMessage(id)(text);
    }
  }
  sendReadReceiptAsPuppetToThirdPartyRoomWithId() {
    // not available for now
  }
  sendTypingEventAsPuppetToThirdPartyRoomWithId() {
    // avoiding UnhandledPromiseRejectionWarning:
  }

}

new Cli({
  port: config.port,
  registrationPath: config.registrationPath,
  generateRegistration: function(reg, callback) {
    puppet.associate().then(()=>{
      reg.setId(AppServiceRegistration.generateToken());
      reg.setHomeserverToken(AppServiceRegistration.generateToken());
      reg.setAppServiceToken(AppServiceRegistration.generateToken());
      reg.setSenderLocalpart("groupmebot");
      reg.addRegexPattern("users", "@groupme_.*", true);
      reg.addRegexPattern("aliases", "#groupme_.*", false);
      callback(reg);
    }).catch(err=>{
      console.error(err.message);
      process.exit(-1);
    });
  },
  run: function(port) {
    const app = new App(config, puppet);
    return puppet.startClient().then(()=>{
      return app.initThirdPartyClient();
    }).then(() => {
      return app.bridge.run(port, config);
    }).then(()=>{
      console.log('Matrix-side listening on port %s', port);
    }).catch(err=>{
      console.error(err.message);
      process.exit(-1);
    });
  }
}).run();
