import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
dotenv.config();
import path from 'path';

import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import gameRoutes from './routes/games.js';
import friendRoutes from './routes/friends.js';
import messageRoutes from './routes/messages.js';
import conversationRoutes from './routes/conversations.js';
import swipeRoutes from './routes/swipe.js';
import platformRoutes from './routes/platforms.js';
import roomsRoutes from './routes/rooms.js';
import genresRoutes from './routes/genres.js';
import gameTypesRoutes from './routes/game-types.js';
import gameRecommendationRoutes from './routes/game-recommendations.js';
import emailVerificationRoutes from './routes/email-verification.js';
import { attachRealtime } from './realtime.js';
import { createServer } from 'http';

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(helmet({
	crossOriginResourcePolicy: { policy: 'cross-origin' },
	crossOriginEmbedderPolicy: false
}));
app.use(express.json());
app.use(morgan('dev'));
// arquivos estáticos de upload
app.use('/uploads', (req, res, next) => {
	res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
	res.setHeader('Access-Control-Allow-Origin', '*');
	next();
}, express.static(path.resolve(process.cwd(), 'uploads')));

app.get('/api/health', (req, res) => res.json({ ok: true }));

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/games', gameRoutes);
app.use('/api/friends', friendRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/conversations', conversationRoutes);
app.use('/api/swipe', swipeRoutes);
app.use('/api/platforms', platformRoutes);
app.use('/api/rooms', roomsRoutes);
app.use('/api/genres', genresRoutes);
app.use('/api/game-types', gameTypesRoutes);
app.use('/api/game-recommendations', gameRecommendationRoutes);
app.use('/api/verification', emailVerificationRoutes);

const port = process.env.PORT || 3333;
// Criar HTTP server e anexar Socket.IO
const { server } = attachRealtime(app);
server.listen(port, () => console.log(`WebLoc API + Realtime em http://localhost:${port}`));




/*
const nodemailer = require('nodemailer')
const transport = nodemailer.createTransport({
	host: 'smtp.gmail.com',
	port: 465,
	secure: true,
	auth: {
		user: 'webloc00@gmail.com',
		pass: 'pomo cnlo urqz gyou'
	}
})
	
transport.sendMail({
from:'Manual do Dev <webloc00@gmail.com>',
to: 'pedrolucasmc6@gmail.com',
subject: 'Enviando email com Nodemailer',
html: '<h1> Olá dev </h1> <p> Esse é um email de teste </p>',
text: 'Olá, Dev este é um email de teste',
})
.then((response ) => console.log ('Email enviado com sucesso !!'))
.catch({err}  => console.log('Erro ao enviar email: ', err));

*/