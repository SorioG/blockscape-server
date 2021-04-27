const WebSocket = require("ws");
var fs = require("fs");
var pkg = require("./package.json");
const path = require("path");


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

console.log("World: "+worldfile);

var saveInterval;

if (!fs.existsSync("./worlds")) {
    fs.mkdirSync("./worlds/")
}

if (!fs.existsSync(`./worlds/${worldfile}.bslvl`)) {
    console.log(`${worldfile}.bslvl does not exist, making a new one...`);
    fs.writeFileSync(`./worlds/${worldfile}.bslvl`, fs.readFileSync("./default.bslvl"));
}

realcode = fs.readFileSync(`./worlds/${worldfile}.bslvl`).toString();

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


wss.on("connection", function connection(ws) {
    let localId = playerIdcount
    ws.playerId = playerIdcount;
    console.log("New Player has been connected with player Id: "+localId);
    playerIdcount++;
    ws.send(JSON.stringify({type:"cmd", msg:"playerId;"+ws.playerId+";"}))
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

    

    ws.on("close", function () {
        broadcast(JSON.stringify({type:"cmd", msg:"despawn;"+localId+";"}), ws)
        broadcast(JSON.stringify({type:"cmd", msg:`alert;Player ${localId} left the server;`}), ws)
        console.log("Player has been disconnected with ID: "+localId);
        playerIdcount--;
    })

    ws.on('message', function (data) {
        parseCmd(data, ws);
    })

})

function parseCmd(cmd, client) {
    let args = cmd.split(";");

    for (let i = 0; i < args.length; i++) {
        if (args[i] == "move") {
            let x = args[i+1]
            let y = args[i+2]
            let hand = args[i+3]
            let animation = args[i+4]
            let flip = args[i+5]
            broadcast(JSON.stringify({type: "cmd", msg: `update;${client.playerId};${x};${y};${hand};${animation};${flip};`}), client)

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

            
        }
        if (args[i] == "break") {
            let blockId = args[i+1]
            broadcast(JSON.stringify({type:"cmd", msg: `removeBlock;${blockId};`}), client)

            let block, index = findBlockbyID(blockId);

            if (block !== null) {
                delete worldtiles[index];
                
            }
        }
        if (args[i] == "chat") {
            let msg = args[i+1]

            if (msg !== "") {
                let formatmsg = `<Player ${client.playerId}> ${msg}`
                console.log(formatmsg);
                broadcast(JSON.stringify({type:"cmd", msg: `alert;${formatmsg};`}), null)
            }
        }
    }
}


wss.on("listening", function() {
    console.log("Blockscape Server is running on port "+wss.address().port);
    loadWorld();
})

saveInterval = setInterval(function () {
    saveWorld();
}, 50000)

function exitHandle() {
    try {
        console.log("Server shutting down...");
        wss.close();
        clearInterval(saveInterval);
        saveWorld();
    } catch(e) {
        console.error(e);
    }
    

    process.exit();
}

process.on("SIGINT", exitHandle);
process.on("SIGTERM", exitHandle);