

module.exports.player = function (plr) {
    
    var admin = false;
    if (plr.address == "::ffff:127.0.0.1") {
        admin = true; 
    }
    plr.on("chat", function (msg) {
        if (admin) {
            if (msg.startsWith("!")) {
                var args = msg.slice(1).split(" ");
                var cmd = args.shift().toLowerCase();

                if (cmd == "kick") {
                    let id = args[0]
                    let player = plr.getServer().findPlayerByID(id)
                    if (player) {
                        player.kick("Kicked by the admin");
                    }
                }
                if (cmd == "tp") {
                    let x = args[0]
                    let y = args[1]
                    plr.teleport(x,y);
                }
                if (cmd == "tnt") {
                    let id = args[0]
                    let pl = plr.getServer().findPlayerByID(id)
                    if (pl) {
                        plr.getServer().broadcast(JSON.stringify({type:"cmd", msg: `addBlock;${pl.x};${pl.y};2;9999999999;`}))
                    }
                }
                if (cmd == "getpos") {
                    plr.alert("Your position is X: " + plr.x + ", Y: " + plr.y);
                }
                if (cmd == "kill") {
                    let id = args[0]
                    let player = plr.getServer().findPlayerByID(id)
                    if (player) {
                        player.sendcommand("instadeath;");
                    }
                }
            }
        }
    })
}