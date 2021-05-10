const WebSocket = require("ws");
var fs = require("fs");
var pkg = require("./package.json");
const path = require("path");
const Player = require("./src/Player");
const Server = require("./src/Server");
var requireindex = require("requireindex");
const EventEmitter = require("events").EventEmitter;


const wss = new WebSocket.Server({
    port: process.env.PORT || 8790
})

console.log("Blockscape Server v"+pkg.version);
console.log(`Platform: ${process.platform}, Node: ${process.version}`)


function broadcast(data, except) {
    wss.clients.forEach(function (ws) {
        if (ws !== except && ws.readyState == WebSocket.OPEN) {
            ws.send(data);
        }
    })
}

var playerIdcount = 0
var worldfile = process.env.WORLD_NAME || "server"
var realcode = "";
var worldconfig;

console.log("World: "+worldfile);

var saveInterval;
var _serverevents = new Server(wss);

if (!fs.existsSync("./worlds")) {
    fs.mkdirSync("./worlds/")
}

if (!fs.existsSync(`./plugins/${worldfile}`)) {
    fs.mkdirSync("./plugins/" + worldfile)
}
var plugins = requireindex(`./plugins/${worldfile}`);
var preplugins = requireindex(`./src/plugins`);

if (!fs.existsSync(`./worlds/${worldfile}.bslvl`)) {
    console.log(`${worldfile}.bslvl does not exist, making a new one...`);
    fs.writeFileSync(`./worlds/${worldfile}.bslvl`, fs.readFileSync("./default.bslvl"));
}

if (!fs.existsSync(`./config/${worldfile}.json`)) {
    console.log(`${worldfile}.json does not exist, making a new one...`);
    fs.writeFileSync(`./config/${worldfile}.json`, fs.readFileSync("./config/config.default.json"));
}

realcode = fs.readFileSync(`./worlds/${worldfile}.bslvl`).toString();
worldconfig = JSON.parse(fs.readFileSync(`./config/${worldfile}.json`).toString());

if (worldconfig.antispam == false) {
    console.warn("The configuration for antispam is disabled, this means anyone can destroy your own server "+
    "and even do many bad things! If you want to keep this server secure, enable this and restart the server.")
}

var worldtiles = [];

function saveWorld() {
    let tiles = []
    let result = "";

    for (let i = 0; i < worldtiles.length; i++) {
        let data = worldtiles[i]
        try {
            result += `tile;${data.animation};${data.x};${data.y};${data.id};`
        } catch(e) {
            // This tile does not exist or it's corrupted.
        }
        
    }

    fs.writeFileSync(`./worlds/${worldfile}.bslvl`, result);
    return result;
}

function getWorld() {
    let tiles = []
    let result = "";

    for (let i = 0; i < worldtiles.length; i++) {
        let data = worldtiles[i]
        try {
            result += `tile;${data.animation};${data.x};${data.y};${data.id};`
        } catch(e) {
            // This tile does not exist or it's corrupted.
        }
    }

    return result;
}

function findBlockbyID(id) {
    for (let i = 0; i < worldtiles.length; i++) {
        let data = worldtiles[i]
        if (!data) continue // This tile is kinda corrupted or it was already deleted.
        
        if (data.id == id) {
            return worldtiles[i], i;
        }
    }
    return null, false;
}

function findPlayerByID(id) {
    for (let i = 0; i < playerIdcount; i++) {
        if (!players[i]) continue;

        if (players[i].id.toString() == id) return players[i];
    }
    return null;
}

function loadWorld() {
    console.log("Loading World...")
    worldtiles = []
    let args = realcode.split(";")


    for (let i = 0; i < args.length; i++) {
        if (args[i] == "tile") {
            worldtiles.push({
                animation: args[i+1],
                x: args[i+2],
                y: args[i+3],
                id: args[i+4]
            });
        }
    }
    console.log("Done loading world.")
}

var players = {};
wss.on("connection", function connection(ws, req) {
    ws.isAlive = true;
    ws.blockSpamTime = 0;
    let ip = req.socket.remoteAddress;
    if (worldconfig.bannedIp.includes(ip)) {
        return ws.close(4800,"Banned from the server");
    }

    let localId = playerIdcount
    ws.playerId = playerIdcount;
    _serverevents.players[localId] = new Player(ws);
    ws.player = _serverevents.players[localId];
    ws.player.id = localId;
    ws.player.address = req.socket.remoteAddress;
    ws.player.server = _serverevents;
    playerIdcount++;
    ws.send(JSON.stringify({type:"cmd", msg:"playerId;"+ws.playerId+";"}))
    ws.send(JSON.stringify({type:"cmd", msg:"changeskin;"+Math.floor(Math.random() * 5)+";"}))
    ws.send(JSON.stringify({
        type:"world",
        msg:getWorld()
    }))
    wss.clients.forEach(function (client) {
        if (client !== ws && client.readyState == WebSocket.OPEN) {
            ws.send(JSON.stringify({type:"cmd", msg:"spawn;"+client.playerId+";"}))
        }
    })
    broadcast(JSON.stringify({type:"cmd", msg:"spawn;"+localId+";"}), ws)
    broadcast(JSON.stringify({type:"cmd", msg:`alert;Player ${localId} joined the server;`}), ws)

    try {
        Object.keys(plugins)
            .filter(i => plugins[i].player != undefined)
            .forEach(i => plugins[i].player(_serverevents.players[localId]));
        
        if (worldconfig.useDefaultPlugins) {
            Object.keys(preplugins)
                .filter(i => preplugins[i].player != undefined)
                .forEach(i => preplugins[i].player(_serverevents.players[localId]));
        }
    } catch(e) {
        console.error(e);
    }

    if (worldconfig["welcome-message"]) {
        ws.send(JSON.stringify({type:"cmd", msg:`alert;${worldconfig["welcome-message"]};`}))
    }

    

    ws.on("close", function () {
        broadcast(JSON.stringify({type:"cmd", msg:"despawn;"+localId+";"}), ws)
        broadcast(JSON.stringify({type:"cmd", msg:`alert;Player ${localId} left the server;`}), ws)
        console.log("Player has been disconnected with ID: "+localId);
        _serverevents.players[localId].emit("disconnect")
        delete _serverevents.players[localId];
        playerIdcount--;
    })

    ws.on('message', function (data) {
        parseCmd(data, ws);
        if (isProtecting) {
            if (ws.blockSpamTime >= worldconfig.maxSpamTime) {
                ws.close(1013,"Spam Detected");
            }
        }
    })

    ws.on('pong', heartbeat);

})

var isProtecting = worldconfig.antispam;

function parseCmd(cmd, client) {
    let args = cmd.split(";");

    for (let i = 0; i < args.length; i++) {
        if (args[i] == "move") {
            let x = args[i+1]
            let y = args[i+2]
            let hand = args[i+3]
            let animation = args[i+4]
            let flip = args[i+5]
            let skinNum = args[i+6]
            broadcast(JSON.stringify({type: "cmd", msg: `update;${client.playerId};${x};${y};${hand};${animation};${flip};${skinNum};`}), client)
            client.player.x = x;
            client.player.y = y;
            client.player.handTile = hand;
            client.player.animation = animation;
            client.player.flip = flip;
            client.player.skinNum = skinNum;
            client.player.emit("move")
        }
        if (args[i] == "place") {
            let x = args[i+1]
            let y = args[i+2]
            let animation = args[i+3]
            let blockId = args[i+4]

            let block,index = findBlockbyID(blockId);

            if (block) {
                blockId = blockId+20;
            }

            broadcast(JSON.stringify({type:"cmd", msg: `addBlock;${x};${y};${animation};${blockId};`}), client)

            worldtiles.push({
                animation: animation,
                x: x,
                y: y,
                id: blockId
            });

            if (isProtecting) {
                client.blockSpamTime++;
            }

            let blk,idx = findBlockbyID(blockId)
            client.player.emit("place", blk);
            
        }
        if (args[i] == "break") {
            let blockId = args[i+1]
            broadcast(JSON.stringify({type:"cmd", msg: `removeBlock;${blockId};`}), client)

            let block, index = findBlockbyID(blockId);

            if (block !== null) {
                client.player.emit("break", block);
                delete worldtiles[index];
                if (isProtecting) {
                    client.blockSpamTime++;
                }
            }
        }
        if (args[i] == "chat") {
            let msg = args[i+1]

            if (msg !== "") {
                let formatmsg = `<Player ${client.playerId}> ${msg}`
                client.player.emit("chat", msg);
                console.log(formatmsg);
                broadcast(JSON.stringify({type:"cmd", msg: `alert;${formatmsg};`}), null)
            }
        }
        if (args[i] == "slap") {
            let plr = args[i+1]

            let victim = findPlayerByID(plr)
            
            if (victim) {
                client.player.emit("slap", victim);
                if (worldconfig.allowPVP) {
                    victim.client.send(JSON.stringify({type:"cmd", msg:"takedamage;"}));
                } else {
                    client.send(JSON.stringify({type:"cmd", msg:"alert;PvP is disabled on this server;"}))
                }
            } else {
                console.warn("Player "+client.playerId+" tried to punch on a invaild player id: " + plr);
            }
        }
        if (args[i] == "sound") {
            let sound = args[i+1]
            if (worldconfig.mutePlayerSounds == false) {
                broadcast(JSON.stringify({type:"cmd", msg:`snd;${client.playerId};${sound};`}), client)
            }
            //broadcast(JSON.stringify({type:"cmd", msg:`snd;${client.playerId};${sound};`}), client)
            //console.log(sound);
        }
        if (args[i] == "info") {
            let ver = args[i+1]
            if (!client.sentinfo) {
                // Avoid spamming the logs after the client sends a information.
                console.log("New Player has been connected with player Id: "+client.playerId+" using "+ver);
                client.sentinfo = true;
            }
            
        }
        if (args[i] == "serverkey") {
            let type = args[i+1];
            if (type == "1") {
                client.player.emit("serverkey", 1);
                //client.send(JSON.stringify({type:"cmd", msg:"changeskin;"+Math.floor(Math.random() * 5)+";"}))
            }
            if (type == "2") {
                //...
                client.player.emit("serverkey", 2);
            }
            if (type == "3") {
                //...
                client.player.emit("serverkey", 3);
            }
            if (type == "4") {
                //...
                client.player.emit("serverkey", 4);
            }
        }
    }
}


wss.on("listening", function() {
    console.log("Blockscape Server is running on port "+wss.address().port);
    loadWorld();
    
    Object.keys(plugins)
        .filter(i => plugins[i].world != undefined)
        .forEach(i => plugins[i].world(_serverevents));

    if (worldconfig.useDefaultPlugins) {
        Object.keys(preplugins)
            .filter(i => preplugins[i].world != undefined)
            .forEach(i => preplugins[i].world(_serverevents));
    }

    _serverevents.emit("listening");
})

saveInterval = setInterval(function () {
    saveWorld();
}, 50000)

function noop() {}

const pinginterval = setInterval(function() {
    wss.clients.forEach(function each(ws) {
      if (ws.isAlive === false) return ws.terminate();
      
      ws.isAlive = false;
      ws.ping(noop);
    });
}, 30000);

const protectinterval = setInterval(function() {
    wss.clients.forEach(function (ws) {
        ws.blockSpamTime = 0;
    })
},10000)

function exitHandle() {
    try {
        console.log("Server shutting down...");
        _serverevents.emit("close");
        wss.close();
        clearInterval(saveInterval);
        clearInterval(pinginterval);
        clearInterval(protectinterval);
        saveWorld();
    } catch(e) {
        console.error(e);
    }
    

    process.exit();
}


function heartbeat() {
    this.isAlive = true;
}


process.on("SIGINT", exitHandle);
process.on("SIGTERM", exitHandle);