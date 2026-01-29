const WebSocket = require('ws');
const http = require('http');
const url = require('url');

const port = process.env.PORT || 8080;

// Créer serveur HTTP pour health checks
const server = http.createServer((req, res) => {
    const parsedUrl = url.parse(req.url, true);
    
    if (parsedUrl.pathname === '/health') {
        res.writeHead(200);
        res.end('OK');
        return;
    }
    
    res.writeHead(404);
    res.end('Not Found');
});

// Créer WebSocket server
const wss = new WebSocket.Server({ server });

// Stockage clients
const clients = new Map();
let clientId = 0;

wss.on('connection', (ws, req) => {
    const id = ++clientId;
    const ip = req.socket.remoteAddress;
    
    clients.set(id, { ws, ip, joined: new Date() });
    
    console.log(`👤 Client ${id} connecté (${ip})`);
    console.log(`📊 Total clients: ${clients.size}`);
    
    // Envoyer ID au client
    ws.send(JSON.stringify({
        type: 'welcome',
        id: id,
        message: 'Bienvenue sur le serveur WebSocket'
    }));
    
    // Broadcast nouvelle connexion
    broadcast({
        type: 'user_joined',
        id: id,
        count: clients.size
    }, id);
    
    // Gérer messages
    ws.on('message', (data) => {
        try {
            const message = data.toString();
            console.log(`📥 ${id}: ${message}`);
            
            // Vérifier si c'est du JSON
            let parsed;
            try {
                parsed = JSON.parse(message);
            } catch {
                parsed = { type: 'message', content: message };
            }
            
            // Broadcast à tous
            broadcast({
                type: 'message',
                from: id,
                content: parsed.content || message,
                timestamp: new Date().toISOString()
            });
            
        } catch (error) {
            console.error('❌ Erreur message:', error);
        }
    });
    
    // Gérer fermeture
    ws.on('close', () => {
        clients.delete(id);
        console.log(`👋 Client ${id} déconnecté`);
        console.log(`📊 Restants: ${clients.size}`);
        
        broadcast({
            type: 'user_left',
            id: id,
            count: clients.size
        });
    });
    
    // Gérer erreurs
    ws.on('error', (error) => {
        console.error(`💥 Erreur client ${id}:`, error);
        clients.delete(id);
    });
    
    // Ping/pong pour garder connexion active
    const interval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
            ws.ping();
        }
    }, 30000);
    
    ws.on('pong', () => {
        // Connexion vivante
    });
    
    ws.on('close', () => {
        clearInterval(interval);
    });
});

// Fonction broadcast
function broadcast(data, excludeId = null) {
    const message = typeof data === 'string' ? data : JSON.stringify(data);
    
    clients.forEach((client, id) => {
        if (id !== excludeId && client.ws.readyState === WebSocket.OPEN) {
            client.ws.send(message);
        }
    });
}

// Gestion arrêt propre
process.on('SIGINT', () => {
    console.log('🛑 Arrêt du serveur...');
    wss.close();
    server.close();
    process.exit(0);
});

// Démarrer serveur
server.listen(port, () => {
    console.log(`✅ Serveur WebSocket démarré sur le port ${port}`);
    console.log(`🌐 Health check: http://localhost:${port}/health`);
    console.log(`📡 En attente de connexions...`);
});

// Stats périodiques
setInterval(() => {
    console.log(`📊 Stats: ${clients.size} clients connectés`);
}, 60000);
