const EventEmitter = require("events").EventEmitter;
var WebSocket = require("ws");

module.exports = class Server extends EventEmitter {
    constructor(wss) {
        super();
        this.wss = wss;
        this.players = {};
        
    }
    findPlayerByID(id) {
        for (let i = 0; i < Object.keys(this.players).length; i++) {
            if (!this.players[i]) continue;
    
            if (this.players[i].id.toString() == id) return this.players[i];
        }
        return null;
    }
    broadcast(data, except) {
        this.wss.clients.forEach(function (ws) {
            if (ws !== except && ws.readyState == WebSocket.OPEN) {
                ws.send(data);
            }
        })
    }
}