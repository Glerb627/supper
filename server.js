const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*", methods: ["GET", "POST"] } });

// MASSIVE WORLD SETTINGS
const WORLD_WIDTH = 4000;
const MP_GROUND = 950; // Fixed ground level so nobody floats!

let players = {};
let mapCoins = [];
let extractionPortals = [];

// Generate map loot across the massive map
for(let i=0; i<80; i++) mapCoins.push({ id: i, x: Math.random() * WORLD_WIDTH, y: MP_GROUND - 10, value: 1 });

setInterval(() => {
    if(extractionPortals.length < 5) {
        extractionPortals.push({ id: Date.now(), x: Math.random() * (WORLD_WIDTH - 400) + 200, y: MP_GROUND, activeTime: 40000 });
    }
}, 8000);

io.on('connection', (socket) => {
    console.log(`Player connected: ${socket.id}`);

    socket.on('join_multiplayer', (data) => {
        players[socket.id] = {
            id: socket.id, name: data.name, skin: data.skin, wager: data.wager, coins: data.wager,
            x: Math.random() * 3000, y: 0 
        };
        socket.emit('init_game', { players, mapCoins, extractionPortals });
        socket.broadcast.emit('player_joined', players[socket.id]);
    });

    socket.on('move', (data) => {
        if(players[socket.id]) {
            players[socket.id].x = data.x; players[socket.id].y = data.y;
            players[socket.id].isDashing = data.isDashing;
            socket.broadcast.emit('player_moved', players[socket.id]);
        }
    });

    socket.on('combat_kill', (victimId) => {
        let killer = players[socket.id];
        let victim = players[victimId];
        if(killer && victim) {
            let lootStolen = killer.wager * victim.wager; 
            killer.coins += lootStolen;
            
            for(let i=0; i<4; i++) mapCoins.push({ id: Date.now()+i, x: victim.x + (Math.random()*100-50), y: victim.y, value: 2 });

            io.emit('player_killed', { killerId: socket.id, victimId: victimId, newCoins: killer.coins });
            io.emit('map_coins_update', mapCoins);
            delete players[victimId];
        }
    });

    socket.on('collect_coin', (coinId) => {
        let coinIndex = mapCoins.findIndex(c => c.id === coinId);
        if(coinIndex !== -1 && players[socket.id]) {
            players[socket.id].coins += mapCoins[coinIndex].value;
            mapCoins.splice(coinIndex, 1);
            io.emit('map_coins_update', mapCoins);
            socket.emit('update_inventory', players[socket.id].coins);
        }
    });

    socket.on('extract', () => {
        if(players[socket.id]) {
            let extractedCoins = players[socket.id].coins;
            socket.emit('extraction_success', extractedCoins);
            delete players[socket.id];
            socket.broadcast.emit('player_left', socket.id);
        }
    });

    socket.on('disconnect', () => {
        delete players[socket.id];
        io.emit('player_left', socket.id);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => { console.log(`Sawblade Server running on port ${PORT}`); });
