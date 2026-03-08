const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

app.use(express.static('public'));

const players = {};
const bullets = {};
const powerups = [];
let bulletId = 0;

// Генерация powerups
setInterval(() => {
  if (powerups.length < 8) {
    powerups.push({
      id: Math.random().toString(36),
      x: Math.random() * 360 - 180,
      y: Math.random() * 260 - 130,
      type: Math.random() > 0.5 ? 'speed' : 'damage'
    });
  }
}, 5000);

io.on('connection', (socket) => {
  console.log('Player connecting:', socket.id);
  
  socket.on('join', (data) => {
    // Проверка лимита игроков
    if (Object.keys(players).length >= 20) {
      socket.emit('serverFull');
      socket.disconnect();
      return;
    }
    
    console.log('Player joined:', socket.id, data.nickname);
    
    players[socket.id] = {
      id: socket.id,
      nickname: data.nickname || 'Игрок',
      x: Math.random() * 360 - 180,
      y: Math.random() * 260 - 130,
      angle: 0,
      bodyAngle: 0,
      speed: 0.3,
      health: 100,
      maxHealth: 100,
      score: 0,
      damage: 10,
      color: parseInt('0x' + Math.floor(Math.random() * 16777215).toString(16))
    };

    socket.emit('init', { id: socket.id, players, powerups });
    socket.broadcast.emit('newPlayer', players[socket.id]);
  });

  socket.on('move', (data) => {
    const player = players[socket.id];
    if (player) {
      player.x = data.x;
      player.y = data.y;
      player.angle = data.angle;
      player.bodyAngle = data.bodyAngle || 0;
    }
  });

  socket.on('shoot', (data) => {
    const player = players[socket.id];
    if (!player) return;
    
    const id = bulletId++;
    bullets[id] = {
      id,
      x: data.x,
      y: data.y,
      vx: Math.cos(data.angle) * 0.8,
      vy: Math.sin(data.angle) * 0.8,
      owner: socket.id,
      damage: player.damage
    };
  });

  socket.on('collectPowerup', (powerupId) => {
    // Удалено - теперь обрабатывается в game loop
  });

  socket.on('disconnect', () => {
    console.log('Player disconnected:', socket.id);
    delete players[socket.id];
    io.emit('playerLeft', socket.id);
  });
});

// Game loop
setInterval(() => {
  // Check powerup collisions
  for (let pid in players) {
    const player = players[pid];
    for (let i = powerups.length - 1; i >= 0; i--) {
      const powerup = powerups[i];
      const dx = powerup.x - player.x;
      const dy = powerup.y - player.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      if (distance < 4) {
        if (powerup.type === 'speed') {
          player.speed = Math.min(player.speed + 0.05, 0.6);
        } else {
          player.damage = Math.min(player.damage + 5, 30);
        }
        
        const collectedId = powerup.id;
        powerups.splice(i, 1);
        io.emit('powerupCollected', collectedId);
        console.log(`Player ${player.nickname} collected ${powerup.type}, speed: ${player.speed}, damage: ${player.damage}`);
      }
    }
  }
  
  // Update bullets
  for (let id in bullets) {
    const bullet = bullets[id];
    bullet.x += bullet.vx;
    bullet.y += bullet.vy;
    
    // Remove out of bounds
    if (bullet.x < -200 || bullet.x > 200 || bullet.y < -150 || bullet.y > 150) {
      delete bullets[id];
      continue;
    }
    
    // Check collision with players
    for (let pid in players) {
      if (pid === bullet.owner) continue;
      
      const player = players[pid];
      const dx = player.x - bullet.x;
      const dy = player.y - bullet.y;
      
      if (Math.sqrt(dx * dx + dy * dy) < 2.5) {
        player.health -= bullet.damage;
        
        if (player.health <= 0) {
          player.health = player.maxHealth;
          player.x = Math.random() * 360 - 180;
          player.y = Math.random() * 260 - 130;
          
          if (players[bullet.owner]) {
            players[bullet.owner].score += 100;
          }
        }
        
        delete bullets[id];
        break;
      }
    }
  }
  
  io.emit('update', { players, bullets, powerups });
}, 1000 / 30);

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
