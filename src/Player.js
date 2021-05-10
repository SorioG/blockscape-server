const EventEmitter = require("events").EventEmitter;
module.exports = class Player extends EventEmitter {
    constructor(data) {
        super();
        this.x = 0;
        this.y = 0;
        this.skinNum = 0;
        this.id = 0;
        this.handTile = 0;
        this.flip = "no";
        this.animation = "0_Stand";
        this.client = data;
        this.address = "";
        this.server = null;
    }
    teleport(x,y) {
        this.client.send(JSON.stringify({type:"cmd", msg:`teleport;${x};${y};`}))
    }
    damage() {
        this.client.send(JSON.stringify({type:"cmd", msg:`takedamage;`}))
    }
    alert(msg) {
        this.client.send(JSON.stringify({type:"cmd", msg:`alert;${msg};`}))
    }
    kick(reason) {
        this.client.close(4810,reason || "Kicked from the server");
    }
    sendcommand(cmd) {
        this.client.send(JSON.stringify({type:"cmd", msg:cmd}))
    }
    sendworld(cmd) {
        this.client.send(JSON.stringify({type:"world", msg:cmd}))
    }
    getServer() {
        return this.server;
    }
}