/**
 * ai-chat.js — AI Chat Assistant
 */
import { initTheme, requireAuth, toast } from '../js/app.js';
import api from '../js/api.js';

initTheme();
requireAuth();

const messagesContainer = document.getElementById('chat-messages');
const chatInput = document.getElementById('chat-input');
const sendBtn = document.getElementById('send-btn');
let conversationId = 'chat-' + Date.now();

function addMessage(role, content, isLoading = false) {
  const msg = document.createElement('div');
  msg.className = `message ${role}`;
  msg.setAttribute('role', 'article');
  msg.setAttribute('aria-label', `${role === 'ai' ? 'AI' : 'Your'} message`);

  const avatarContent = role === 'ai' ? '🤖' : (localStorage.getItem('sp_user') ? JSON.parse(localStorage.getItem('sp_user'))?.name?.[0] : 'S');
  const avatarStyle = role === 'ai'
    ? 'background:linear-gradient(135deg,var(--primary),var(--secondary))'
    : 'background:linear-gradient(135deg,var(--emerald-500),var(--cyan-500))';

  const parsedContent = isLoading ? `<div class="loading-dots"><span></span><span></span><span></span></div>` : parseMarkdown(content);

  msg.innerHTML = `
    <div class="message-avatar" style="${avatarStyle}" aria-hidden="true">${avatarContent}</div>
    <div class="message-bubble">${parsedContent}</div>
  `;

  messagesContainer.appendChild(msg);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
  return msg;
}

function parseMarkdown(text) {
  return text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>)/gs, '<ul>$1</ul>')
    .replace(/^(\d+)\. (.+)$/gm, '<li>$2</li>')
    .replace(/\n\n/g, '<br><br>')
    .replace(/\n/g, '<br>');
}

async function sendMessage(message) {
  if (!message.trim()) return;

  addMessage('user', message);
  chatInput.value = '';
  chatInput.style.height = '52px';

  const loadingMsg = addMessage('ai', '', true);
  sendBtn.disabled = true;
  document.getElementById('send-text').classList.add('hidden');
  document.getElementById('send-spinner').classList.remove('hidden');

  try {
    const result = await api.chat(message, conversationId);
    loadingMsg.querySelector('.message-bubble').innerHTML = parseMarkdown(result.response);
  } catch (err) {
    loadingMsg.querySelector('.message-bubble').innerHTML = `Sorry, I'm having trouble connecting right now. Please try again. <em>(${err.message})</em>`;
    loadingMsg.querySelector('.message-bubble').style.borderColor = 'var(--danger)';
  } finally {
    sendBtn.disabled = false;
    document.getElementById('send-text').classList.remove('hidden');
    document.getElementById('send-spinner').classList.add('hidden');
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }
}

sendBtn?.addEventListener('click', () => sendMessage(chatInput.value));

chatInput?.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage(chatInput.value);
  }
});

// Auto-resize textarea
chatInput?.addEventListener('input', () => {
  chatInput.style.height = '52px';
  chatInput.style.height = Math.min(chatInput.scrollHeight, 120) + 'px';
});

// Quick prompts
document.querySelectorAll('.quick-prompt-btn').forEach(btn => {
  btn.addEventListener('click', () => sendMessage(btn.dataset.prompt));
});

// Clear chat
document.getElementById('clear-chat')?.addEventListener('click', () => {
  messagesContainer.innerHTML = '';
  conversationId = 'chat-' + Date.now();
  addMessage('ai', "Chat cleared! What would you like to know? 👋");
});
