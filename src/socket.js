import { io } from 'socket.io-client';
const socket = io('http://localhost:3000');
// 暴露到全局，方便控制台调试
window.socket = socket;
export default socket;