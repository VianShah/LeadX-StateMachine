const state = {
  name: '',
  voice: null,   // { id, name, lang, meta, ... } picked on the voice screen
  run: null,     // the active run snapshot, kept current by machine.js
};

function goTo(id){
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}
