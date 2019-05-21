# matrix-puppet-groupme [![#matrix-puppet-bridge:matrix.org](https://img.shields.io/matrix/matrix-puppet-bridge:matrix.org.svg?label=%23matrix-puppet-bridge%3Amatrix.org&logo=matrix&server_fqdn=matrix.org)](https://matrix.to/#/#matrix-puppet-bridge:matrix.org)

This is a Matrix bridge for GroupMe

## Requirements

You will need to acquire your Access Token from GroupMe.

* Get your access token by going to https://dev.groupme.com/ and clicking the "Access Token" link in the top right.

## Installation

clone this repo

cd into the directory

run `npm install`

## Configure

Copy `config.sample.json` to `config.json` and update it to match your setup

* Place the access token and domain name of your homeserver (or IP address) into the `accessToken` and `homeserverURL` sections respectively, keeping the `" "` around them.
* The 'registration' setting in the config.json needs to be set to the path of this file. By default, it already is.
* You do not need to open any ports to bind port 8090. The bridge does it all automatically.

## Register the App Service

Generate an `groupme-registration.yaml` file with `node index.js -r -u "http://localhost:8090"`

* **IMPORTANT!** Starting in the beginning of 2019, registration files required [non-exclusive aliases](https://github.com/matrix-hacks/matrix-puppet-slack/issues/73). After successfully creating your `groupme-registration` file, edit it to replace `aliases: []` with:
```
aliases:
   -exclusive: false
    regex: '#groupme_.*'
```

## Launching the Bridge

Copy this `groupme-registration.yaml` file to your home server. Make sure that from the perspective of the homeserver, the url is correctly pointing to your bridge server. e.g. `url: 'http://your-bridge-server.example.org:8090'` and is reachable.

Edit your homeserver.yaml file and update the `app_service_config_files` with the path to the `groupme-registration.yaml` file.

Launch the bridge with ```node index.js```.

Restart your HS.

## Discussion, Help and Support

Join us in the [![Matrix Puppet Bridge](https://user-images.githubusercontent.com/13843293/52007839-4b2f6580-24c7-11e9-9a6c-14d8fc0d0737.png)](https://matrix.to/#/#matrix-puppet-bridge:matrix.org) room
