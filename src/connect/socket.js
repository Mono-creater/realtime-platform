// src/socket.js
import { io } from 'socket.io-client';

const socket = io('http://localhost:3000'); // 后端地址

export default socket;