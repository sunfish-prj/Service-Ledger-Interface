/**
 * This file is part of SUNFISH Registry Interface.
 *
 * SUNFISH Registry Interface is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * SUNFISH Registry Interface is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License along with Foobar.  If not, see <http://www.gnu.org/licenses/>.
 */

//Author: Md Sadek Ferdous

var express = require('express');
var fs = require('fs');
var url = require( "url" );
var sleep = require('sleep');

var ini = require('ini');
var log4js = require('log4js');
var logger = log4js.getLogger('STATE');

var hfc = require('fabric-client');
var utils = require('fabric-client/lib/utils.js');
var Peer = require('fabric-client/lib/Peer.js');
var Orderer = require('fabric-client/lib/Orderer.js');
var EventHub = require('fabric-client/lib/EventHub.js');

var config = require('./config.json');
var helper = require('./helper.js');

var express = require('express');
var https = require('https');
var http = require('http');
var queryString = require( "querystring" );

var crypto = require('crypto'),
  algorithm = 'aes-256-ctr',
  encKey = new Buffer('eeng4ge0woobohgooqu4ieriwohgoo6C');

var querystring = require('querystring');

var configIni = ini.parse(fs.readFileSync('./config.ini', 'utf-8'))

logger.setLevel('INFO');

var client = new hfc();
var chain;
var eventhub;
var tx_id = null;

var start = true;

var index = 1202;

dockerIP = configIni.dockerIP;

process.on('SIGINT', function() {
    logger.info("Caught interrupt signal");
    process.exit();
});

init();

function init() {
	chain = client.newChain(config.chainName);
	chain.addOrderer(new Orderer(config.orderer.orderer_url));
	eventhub = new EventHub();
	eventhub.setPeerAddr(config.events[0].event_url);
	eventhub.connect();
	for (var i = 0; i < config.peers.length; i++) {
		chain.addPeer(new Peer(config.peers[i].peer_url));
	}
}

eventhub.registerChaincodeEvent("state", 'storeState', function(result){
  logger.info('======Store State chaincode event received!======');
  var id = result.payload.toString('utf8');
  logger.info("Store State Event:" + id);  
});

eventhub.registerChaincodeEvent("state", 'updateState', function(result){
  logger.info('======Update State chaincode event received!========');
  var id = result.payload.toString('utf8');
  logger.info("Update State Event:" + id);
});

eventhub.registerChaincodeEvent("state", 'deleteState', function(result){
  logger.info('======Delete State chaincode event received!========');
  var id = result.payload.toString('utf8');
  logger.info("Delete State Event:" + id);
});

function validate(token){
  //TODO: write the code to validate token...
  return true;
}


function keyFoundTest(id, req, res, op){
  //the code to check if there is already a key with the supplied id in the registry. If so, return true, else false  

  hfc.newDefaultKeyValueStore({
    path: config.keyValueStore
  }).then(function(store) {
      client.setStateStore(store);
      return helper.getSubmitter(client);
  }).then(
      function(admin) {    
          var targets = [];
          for (var i = 0; i < config.peers.length; i++) {
              targets.push(config.peers[i]);
          }

          var args = [
          "read",
          id
          ];
          //chaincode query request
          var request = {
              targets: targets,
              chaincodeId: "state",
              chainId: "sunfish",
              txId: utils.buildTransactionID(),
              nonce: utils.getNonce(),
              fcn: "invoke",
              args: args
          };
          // Query chaincode
          return chain.queryByChaincode(request);
      }
  ).then(
      function(response_payloads) {        
        if (response_payloads === undefined || response_payloads.length === 0){
          if (op === 'store')storeAfterCheck(req, res, false);
          else if (op === 'update')updateAfterCheck(req, res, false);          
          else if (op === 'delete')deleteAfterCheck(req, res, false);
          else if (op === 'read')readAfterCheck(req, res, false);
        } else {
          if (op === 'store')storeAfterCheck(req, res, true);
          else if (op === 'update')updateAfterCheck(req, res, true);          
          else if (op === 'delete')deleteAfterCheck(req, res, true);
          else if (op === 'read')readAfterCheck(req, res, true);
        }         
      }
  ).catch(
      function(err) {
          logger.error('Failed to end to end test with error:' + err.stack ? err.stack : err);
      }
  );  
}

function encrypt(text){
  var cipher = crypto.createCipher(algorithm,encKey)
  var crypted = cipher.update(text,'utf8','hex')
  crypted += cipher.final('hex');
  return crypted;
}
 
function decrypt(text){
  var decipher = crypto.createDecipher(algorithm,encKey)
  var dec = decipher.update(text,'hex','utf8')
  dec += decipher.final('utf8');
  return dec;
}

function storeAfterCheck(req, res, flag){
  if(flag){
    res.writeHead(409);
    res.end('The operation is not allowed as the state data already exists!\n');
  } else {            
    serviceID = req.body.serviceID;  
    url = req.body.url;
    name = req.body.name;
    
    /**          
     * The code to save the collected information into the smart-contract goes below.....
     * 
     */                                        

    var args = [
      "store",      
      serviceID,
      url,
      name
    ]         

    hfc.newDefaultKeyValueStore({
      path: config.keyValueStore        
    }).then(function(store) {
      client.setStateStore(store);
      return helper.getSubmitter(client);
    }).then(
      function(admin) {        
        tx_id = helper.getTxId();
        var nonce = utils.getNonce();
        
        var request = {
          chaincodeId: "state",
          fcn: "invoke",
          args: args,
          chainId: "sunfish",
          txId: tx_id,
          nonce: nonce
        };
        return chain.sendTransactionProposal(request);
      }
    ).then(
      function(results) {
        return helper.processProposal(chain, results, 'move');
      }
    ).then(
      function(response) {      
        if (response.status === 'SUCCESS') {                

          logger.info('Successfully stored state data into the registry!');
          
          res.writeHead(200, {"Content-Type": "application/json"});
            
            var json = JSON.stringify({ 
              "message": "Successfully stored state data into the registry!"
            });            
            res.end(json + '\n');          
        }
      }
    ).catch(
      function(err) {
        logger.info("error:" + err.stack ? err.stack : err);
        eventhub.disconnect();              
      }
    );                
  }  
}

function updateAfterCheck(req, res, flag){
  if(!flag){
    res.writeHead(404);
    res.end('The requested state information does not exist!\n');
  } else {    
    serviceID = req.body.serviceID;
    list = req.body.list;     
          
    /**
      * Update key in the registry
      */             
    

    var args = [
        "update",
        serviceID,            
        JSON.stringify(list)
      ]         

      hfc.newDefaultKeyValueStore({
        path: config.keyValueStore        
      }).then(function(store) {        
        client.setStateStore(store);
        return helper.getSubmitter(client);
      }).then(
        function(admin) {          
          tx_id = helper.getTxId();
          var nonce = utils.getNonce();
          
          var request = {
            chaincodeId: "state",
            fcn: "invoke",
            args: args,
            chainId: "sunfish",
            txId: tx_id,
            nonce: nonce
          };
          return chain.sendTransactionProposal(request);
        }
      ).then(
        function(results) {
          return helper.processProposal(chain, results, 'move');
        }
      ).then(
        function(response) {
          if (response.status === 'SUCCESS') {                

            logger.info('The state data has been successfully updated!');
            
            returnMessage = "The state data has been successfully updated!";

            res.writeHead(200, {"Content-Type": "application/json"});
            
            var json = JSON.stringify({ 
              "message": returnMessage    
            });
            
            res.end(json + '\n');            
          }
        }
      ).catch(
        function(err) {
          logger.info("error:" + err.stack ? err.stack : err);
          eventhub.disconnect();
        }
      );                                                                                
  }
}

function deleteAfterCheck(req, res, flag){
  if(!flag){
    res.writeHead(404);
    res.end('The requested state information does not exist!\n');
  } else {
    requestorID = req.body.requestorID;
    token = req.body.token;  
    serviceID = req.body.serviceID;

    logger.info("=========Now at deleteAfterCheck, for index:" + serviceID  +"==========");

    var args = [
      "delete",
      serviceID                 
    ]         
    hfc.newDefaultKeyValueStore({
      path: config.keyValueStore        
    }).then(function(store) {                          
      client.setStateStore(store);
      return helper.getSubmitter(client);
    }).then(
      function(admin) {        
        tx_id = helper.getTxId();
        var nonce = utils.getNonce();
        
        var request = {
          chaincodeId: "state",
          fcn: "invoke",
          args: args,
          chainId: "sunfish",
          txId: tx_id,
          nonce: nonce
        };
        return chain.sendTransactionProposal(request);
      }
    ).then(
      function(results) {        
        return helper.processProposal(chain, results, 'move');
      }
    ).then(
      function(response) {
        if (response.status === 'SUCCESS') {                

          logger.info('Successfully removed the state information!');
            
          returnMessage = "Successfully removed the state information!";

          res.writeHead(200, {"Content-Type": "application/json"});
          
          var json = JSON.stringify({ 
            "message": returnMessage    
          });
          
          res.end(json + '\n');
        }
      }
    ).catch(
      function(err) {
        logger.info("error:" + err.stack ? err.stack : err);
        eventhub.disconnect();        
      }
    );
    
  }
}

function readAfterCheck(req, res, flag){
  if(!flag){    
    res.writeHead(404);
    res.end('The requested state information does not exist!\n');
  } else {
    requestorID = req.body.requestorID;
    token = req.body.token;  
    serviceID = req.body.serviceID;

    hfc.newDefaultKeyValueStore({
      path: config.keyValueStore
    }).then(function(store) {
        client.setStateStore(store);
        return helper.getSubmitter(client);
    }).then(
        function(admin) {            
            var targets = [];
            for (var i = 0; i < config.peers.length; i++) {
                targets.push(config.peers[i]);
            }

            var args = [
            "read",
            serviceID
            ];
            //chaincode query request
            var request = {
                targets: targets,
                chaincodeId: "state",
                chainId: "sunfish",
                txId: utils.buildTransactionID(),
                nonce: utils.getNonce(),
                fcn: "invoke",
                args: args
            };
            // Query chaincode
            return chain.queryByChaincode(request);
        }
    ).then(
        function(response_payloads) {            
            for (let i = 0; i < 1; i++) {
                
                var logs = response_payloads[i].toString('utf8');                
                var jsonLogs = JSON.parse(logs);

                name = jsonLogs.Name;
                serviceID = jsonLogs.ServiceID;
                URL = jsonLogs.URL;
                
                var json = JSON.stringify({ 
                  "serviceID": serviceID,
                  "url": URL,
                  "name": name
                });                                             

                res.writeHead(200, {"Content-Type": "application/json"});                                       
                res.end(json + '\n');
            }
        }
    ).catch(
        function(err) {
            logger.error('Failed to end to end test with error:' + err.stack ? err.stack : err);
        }
    );
  }  
}

module.exports.store = function(req,res){
  
  requestorID = req.body.requestorID;
  token = req.body.token;
  serviceID = req.body.serviceID;  
  url = req.body.url;
  name = req.body.name;
  

  /**
   * At first check if the required parameters are there. If not send a 400 response, else proceed...
   * Then, validate the token. If unsuccessful, send a 401 response, else proceed....
   * Then, check if there is already a key with the ID. If so, send a 409 response, else proceed....    
   */
  if (requestorID == undefined || token == undefined || serviceID == undefined || url == undefined || name == undefined) {
    res.writeHead(400);
    res.end('Invalid request, required parameter(s) missing!\n');
  } if(!validate(token)) {    
    res.writeHead(401);
    res.end('The operation is not allowed (unauthorised access, the token is invalid, etc.).\n');  
  } else {
    keyFoundTest(serviceID, req, res, "store");
  }  
}

module.exports.update = function(req,res){
  requestorID = req.body.requestorID;
  token = req.body.token;
  serviceID = req.body.serviceID;
  list = req.body.list;  

  /**
   * At first check if the required parameters are there. If not send a 400 response, else proceed...
   * Then, validate the token. If unsuccessful, send a 401 response, else proceed....
   * Then, check if there is already a key with the ID. If not, send a 404 response, else proceed....    
   */

  if (requestorID == undefined || token == undefined || serviceID == undefined || list == undefined) {
    res.writeHead(400);
    res.end('Invalid request, required parameter(s) missing!\n');
  } if(!validate(token)) {    
    res.writeHead(401);
    res.end('The operation is not allowed (unauthorised access, the token is invalid, etc.).\n');  
  } else {
    keyFoundTest(serviceID, req, res, "update");
  }  
}

module.exports.delete = function(req,res){
  
  requestorID = req.body.requestorID;
  token = req.body.token;  
  serviceID = req.body.serviceID;  

  /**
   * At first check if the required parameters are there. If not send a 400 response, else proceed...
   * Then, validate the token. If unsuccessful, send a 401 response, else proceed....
   * Then, check if there is already a key with the ID. If not, send a 404 response, else proceed....    
   */

  if (requestorID == undefined || token == undefined || serviceID == undefined) {
    res.writeHead(400);
    res.end('Invalid request, required parameter(s) missing!\n');
  } if(!validate(token)) {    
    res.writeHead(401);
    res.end('The operation is not allowed (unauthorised access, the token is invalid, etc.).\n');  
  } else {
    keyFoundTest(serviceID, req, res, "delete");
  }
}

module.exports.read = function(req,res){
  
  requestorID = req.body.requestorID;
  token = req.body.token;    
  serviceID = req.body.serviceID;

  /**
   * At first check if the required parameters are there. If not send a 400 response, else proceed...
   * Then, validate the token. If unsuccessful, send a 401 response, else proceed....
   * Then, check if there is already a key with the ID. If not, send a 404 response, else proceed....    
   */

  if (requestorID == undefined || token == undefined || serviceID == undefined) {
    res.writeHead(400);
    res.end('Invalid request, required parameter(s) missing!\n');
  } if(!validate(token)) {    
    res.writeHead(401);
    res.end('The operation is not allowed (unauthorised access, the token is invalid, etc.).\n');  
  } else {
    keyFoundTest(serviceID, req, res, "read");
  }
}