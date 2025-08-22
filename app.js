document.addEventListener('DOMContentLoaded', function(){
try{
  var state = JSON.parse(localStorage.getItem('keep_like_notes_v1')||'[]');
  var root = document.getElementById('keepApp');
  if(!root) return;

  var todoList = document.getElementById('todoList');
  var doneList = document.getElementById('doneList');
  var input = document.getElementById('newText');
  var addBtn = document.getElementById('addBtn');
  var addSampleBtn = document.getElementById('addSampleBtn');
  var emptyMsg = document.getElementById('emptyMsg');

  function save(){ localStorage.setItem('keep_like_notes_v1', JSON.stringify(state)); }
  function fmt(ts){ return new Date(ts).toLocaleString('cs-CZ'); }

  function render(){
    todoList.innerHTML=''; doneList.innerHTML='';
    var todos = state.filter(n=>!n.done).sort((a,b)=>b.created-a.created);
    var dones = state.filter(n=>n.done).sort((a,b)=>b.completed-a.completed);
    todos.forEach(renderItem.bind(null,todoList));
    dones.forEach(renderItem.bind(null,doneList));
    emptyMsg.hidden = state.length>0;
    save();
  }

  function renderItem(container,note){
    var li=document.createElement('li'); li.className='item'+(note.done?' done':'');
    var cb=document.createElement('input'); cb.type='checkbox'; cb.checked=!!note.done;
    cb.addEventListener('change',()=>{ note.done=cb.checked; note.completed=note.done?Date.now():null; render(); });
    var span=document.createElement('span'); span.textContent=note.text;
    var meta=document.createElement('span'); meta.className='meta'; meta.textContent=' ('+fmt(note.created)+(note.completed?', splněno '+fmt(note.completed):'')+')';
    li.appendChild(cb); li.appendChild(span); li.appendChild(meta);
    container.appendChild(li);
  }

  function addNote(text){
    var t=(text||'').trim(); if(!t) return;
    state.push({id:Math.random().toString(36).slice(2),text:t,done:false,created:Date.now(),completed:null});
    input.value=''; render();
  }

  addBtn.addEventListener('click',()=>addNote(input.value));
  input.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();addNote(input.value)}});
  addSampleBtn.addEventListener('click',()=>addNote('Ukázková poznámka'));

  render();
}catch(e){
  console.error('Fatální chyba aplikace:', e);
  var b=document.getElementById('fatalBanner'); if(b) b.hidden=false;
}});