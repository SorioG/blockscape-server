// This is a example plugin for the server.

module.exports.world = function (server) {
    console.log("Example Plugin loaded from the world.")
}

module.exports.player = function (plr) {
    console.log("Example Plugin loaded from the player.")
}