const nameInput = document.getElementById('captureName');
const startBtn = document.getElementById('btnStart');

function syncCapture(){
  startBtn.disabled = nameInput.value.trim().length < 2;
}
nameInput.addEventListener('input', syncCapture);
nameInput.addEventListener('keydown', (e) => { if(e.key === 'Enter' && !startBtn.disabled) startBtn.click(); });
startBtn.addEventListener('click', () => {
  state.name = nameInput.value.trim();
  enterIntro();
});
syncCapture();
