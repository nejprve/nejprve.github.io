document.addEventListener('DOMContentLoaded', function(){
try{
  (function(){
    var LS_KEY = 'keep_like_notes_v1';
    var ALLOWED_TAGS = ['skola','domov','seberozvoj'];
    var DEFAULT_TAG = 'domov';

    // --- Auto-export (File System Access API) ---
    var autoExportEnabled = JSON.parse(localStorage.getItem(LS_KEY + '_autoExport') || 'false');
    var fileHandle = null;
    var autoExportTimer = null;
    var supportsFS = !!(window.showSaveFilePicker || window.chooseFileSystemEntries);

    function notifyHint(msg, isError){
      var el = document.getElementById('autoExportHint');
      if(!el) return;
      el.textContent = msg;
      el.className = 'hint' + (isError ? ' error' : '');
      clearTimeout(notifyHint._t);
      notifyHint._t = setTimeout(function(){ el.textContent=''; el.className='hint'; }, 4000);
    }
    async function pickExportFile(){
      if(!supportsFS){ notifyHint('Auto‑export není podporován v tomto prohlížeči.', true); return; }
      try{
        var handle = await window.showSaveFilePicker({
          suggestedName: 'moje_poznamky.json',
          types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }]
        });
        fileHandle = handle;
        var perm = await fileHandle.requestPermission({ mode: 'readwrite' });
        if (perm !== 'granted'){ notifyHint('Nedostatečné oprávnění k zápisu.', true); fileHandle = null; return; }
        notifyHint('Cílový soubor vybrán.'); 
      }catch(err){ notifyHint('Výběr souboru zrušen.', true); }
    }
    async function writeFile(blob){
      if(!fileHandle) return;
      try{
        const w = await fileHandle.createWritable();
        await w.write(blob); await w.close();
        notifyHint('Auto‑export proveden ✓');
      }catch(err){ notifyHint('Auto‑export selhal: ' + err.message, true); }
    }
    function debounceAutoExport(run){ clearTimeout(autoExportTimer); autoExportTimer = setTimeout(run, 800); }
    function maybeAutoExport(state){
      if(!autoExportEnabled || !fileHandle) return;
      var payload = { version: 9, exportedAt: Date.now(), notes: state };
      var blob = new Blob([JSON.stringify(payload,null,2)], {type:'application/json'});
      debounceAutoExport(function(){ writeFile(blob); });
    }
    function setAutoExportUI(){
      var toggle = document.getElementById('autoExportToggle');
      var pickBtn = document.getElementById('pickFileBtn');
      if(toggle){ toggle.checked = !!autoExportEnabled; toggle.disabled = !supportsFS; }
      if(pickBtn){ pickBtn.disabled = !supportsFS; pickBtn.addEventListener('click', pickExportFile); }
      if(!supportsFS){ notifyHint('Auto‑export vyžaduje Chrome/Edge (HTTPS).', true); }
      if(toggle){
        toggle.addEventListener('change', function(){
          autoExportEnabled = toggle.checked;
          localStorage.setItem(LS_KEY + '_autoExport', JSON.stringify(!!autoExportEnabled));
          if (autoExportEnabled && !fileHandle){ pickExportFile(); }
          else { notifyHint(autoExportEnabled ? 'Auto‑export zapnut.' : 'Auto‑export vypnut.'); }
        });
      }
    }

    // --- Datový model ---
    function load(){ try{ return JSON.parse(localStorage.getItem(LS_KEY) || '[]') } catch(e){ return [] } }
    function save(state){ try{ localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch(e){} }

    function fmt(ts){ return new Date(ts).toLocaleString('cs-CZ', {year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit'}); }
    function uid(){ return Math.random().toString(36).slice(2,9) + Date.now().toString(36) }

    function toLocalDatetimeValue(ts){
      var d = new Date(ts);
      var pad = n => String(n).padStart(2,'0');
      return d.getFullYear() + '-' + pad(d.getMonth()+1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());
    }
    function fromLocalDatetimeValue(val){
      if(!val) return null;
      var d = new Date(val);
      var t = d.getTime();
      return isNaN(t) ? null : t;
    }

    var state = load();
    // upgrade starších záznamů
    state.forEach(function(n){
      if(typeof n.created !== 'number') n.created = Date.now();
      if(!('completed' in n)) n.completed = null;
      if(!('done' in n)) n.done = false;
      if(typeof n.text !== 'string') n.text = String(n.text || '');
      if(!n.tag || ALLOWED_TAGS.indexOf(n.tag) === -1) n.tag = DEFAULT_TAG;
    });

    var root = document.getElementById('keepApp');
    if(!root) return;

    // UI refs
    var todoList = document.getElementById('todoList');
    var doneList = document.getElementById('doneList');
    var input = document.getElementById('newText');
    var addBtn = document.getElementById('addBtn');
    var emptyMsg = document.getElementById('emptyMsg');
    var exportBtn = document.getElementById('exportBtn');
    var importFile = document.getElementById('importFile');
    var newTag = document.getElementById('newTag');
    var filterTag = document.getElementById('filterTag');

    // Dialogy
    var dlg = document.getElementById('timeDialog');
    var dlgCreated = document.getElementById('dlgCreated');
    var dlgCompleted = document.getElementById('dlgCompleted');
    var dlgSave = document.getElementById('dlgSave');
    var dlgError = document.getElementById('dlgError');
    var dlgInfo = document.getElementById('dlgInfo');
    var dlgEditingId = null;

    var confirmDlg = document.getElementById('confirmDialog');
    var confirmText = document.getElementById('confirmText');

    function confirmDelete(message){
      return new Promise(function(resolve){
        if(confirmText) confirmText.textContent = message || 'Opravdu smazat?';
        confirmDlg.showModal();
        var onClose = function(){ confirmDlg.removeEventListener('close', onClose); resolve(confirmDlg.returnValue === 'yes'); };
        confirmDlg.addEventListener('close', onClose);
      });
    }

    var currentFilter = (localStorage.getItem(LS_KEY + '_filter') || 'all');
    if (filterTag){ filterTag.value = currentFilter; }
    if (filterTag){
      filterTag.addEventListener('change', function(){
        currentFilter = filterTag.value;
        localStorage.setItem(LS_KEY + '_filter', currentFilter);
        render();
      });
    }
    function applyTagFilter(arr){ return currentFilter === 'all' ? arr.slice() : arr.filter(function(n){ return n.tag === currentFilter }); }
    function tagLabel(tag){ return tag==='skola'?'Škola':tag==='domov'?'Domov':tag==='seberozvoj'?'Seberozvoj':tag; }
    function isFutureNote(note){ var now = Date.now(); return (note.created > now) || (note.completed && note.completed > now); }

    function render(){
      var filtered = applyTagFilter(state);
      var todos = filtered.filter(function(n){ return !n.done }).sort(function(a,b){ return b.created - a.created });
      var dones = filtered.filter(function(n){ return n.done }).sort(function(a,b){
        var ac = (typeof a.completed==='number' ? a.completed : a.created);
        var bc = (typeof b.completed==='number' ? b.completed : b.created);
        return bc - ac;
      });

      renderList(todoList, todos);
      renderList(doneList, dones);
      emptyMsg.hidden = filtered.length !== 0;

      save(state);
      maybeAutoExport(state);
    }

    function renderList(container, items){
      container.innerHTML = '';
      items.forEach(function(note){
        var li = document.createElement('li');
        li.className = 'item' + (note.done ? ' done' : '');

        var cb = document.createElement('input');
        cb.type = 'checkbox'; cb.className = 'checkbox'; cb.checked = !!note.done;
        cb.addEventListener('change', function(){
          note.done = cb.checked;
          if (note.done && !note.completed) { note.completed = Date.now(); }
          if (!note.done) { note.completed = null; }
          render();
        });

        var textWrap = document.createElement('div');
        textWrap.className = 'text';

        var chip = document.createElement('span');
        chip.className = 'tag-chip tag-' + note.tag;
        chip.textContent = tagLabel(note.tag);

        var labelSpan = document.createElement('span');
        labelSpan.className = 'label';
        labelSpan.contentEditable = true; labelSpan.spellcheck = true;
        labelSpan.textContent = note.text || '';
        labelSpan.addEventListener('input', function(){ note.text = (labelSpan.textContent || '').trim(); save(state); });
        labelSpan.addEventListener('keydown', function(e){ if (e.key === 'Enter'){ e.preventDefault(); labelSpan.blur(); } });

        var metaSpan = document.createElement('span');
        metaSpan.className = 'meta-note';
        metaSpan.textContent = ' (vložené ' + fmt(note.created) + (note.completed ? ', splněno ' + fmt(note.completed) : '') + ')';

        textWrap.appendChild(chip);
        textWrap.appendChild(labelSpan);
        textWrap.appendChild(metaSpan);

        var future = isFutureNote(note);
        var futureSpan = document.createElement('span');
        if(future){
          futureSpan.className = 'future-flag';
          futureSpan.textContent = '•';
          var tip = 'Událost je v budoucnosti: ';
          if (note.created > Date.now()) tip += 'Vložené ' + fmt(note.created) + '. ';
          if (note.completed && note.completed > Date.now()) tip += 'Splněno ' + fmt(note.completed) + '.';
          futureSpan.title = tip.trim();
        }

        var editTimeBtn = document.createElement('button');
        editTimeBtn.className = 'iconbtn'; editTimeBtn.type = 'button'; editTimeBtn.title = 'Upravit časy'; editTimeBtn.textContent = '🕒';
        editTimeBtn.addEventListener('click', function(){
          dlgEditingId = note.id;
          if(dlg){ dlg.showModal(); }
          if(dlgCreated) dlgCreated.value = toLocalDatetimeValue(note.created);
          if(dlgCompleted) dlgCompleted.value = note.completed ? toLocalDatetimeValue(note.completed) : '';
          if(dlgError) dlgError.hidden = true;
          if(dlgInfo) dlgInfo.hidden = true;
        });

        var delBtn = document.createElement('button');
        delBtn.className = 'iconbtn'; delBtn.type = 'button'; delBtn.title = 'Smazat'; delBtn.textContent = '✕';
        delBtn.addEventListener('click', async function(){
          var ok = await confirmDelete('Opravdu chcete smazat poznámku: "' + note.text + '"?');
          if (!ok) return;
          state = state.filter(function(n){ return n.id !== note.id });
          render();
        });

        li.appendChild(cb);
        li.appendChild(textWrap);
        if (future) li.appendChild(futureSpan);   /* modrá tečka před hodinami */
        li.appendChild(editTimeBtn);
        li.appendChild(delBtn);
        container.appendChild(li);
      });
    }

    function addNote(text){
      var t = (text || '').trim();
      if (!t) { input && input.focus(); return; }
      var tag = (newTag && ALLOWED_TAGS.indexOf(newTag.value) !== -1) ? newTag.value : DEFAULT_TAG;
      state.push({ id: uid(), text: t, tag: tag, done: false, created: Date.now(), completed: null });
      input.value = '';
      render();
    }

    function exportNotes(){
      var payload = { version: 9, exportedAt: Date.now(), notes: state };
      var blob = new Blob([JSON.stringify(payload,null,2)], {type:'application/json'});
      if (fileHandle && autoExportEnabled){ writeFile(blob); return; }
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      var stamp = new Date().toISOString().slice(0,19).replace(/[:T]/g,'-');
      a.href = url; a.download = 'notes-' + stamp + '.json';
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    }

    function importNotes(file){
      if(!file) return;
      var reader = new FileReader();
      reader.onload = function(){
        try{
          var data = JSON.parse(reader.result || 'null');
          var arr = Array.isArray(data) ? data : data.notes;
          if(!Array.isArray(arr)) throw new Error('Neočekávaný formát.');

          var normalize = function(n){
            var t = (n.tag && ALLOWED_TAGS.indexOf(n.tag)!==-1) ? n.tag : DEFAULT_TAG;
            return { id: typeof n.id==='string'?n.id:uid(), text: String(n.text||''), tag: t, done: !!n.done,
                     created: typeof n.created==='number'? n.created : Date.now(),
                     completed: (n.completed && typeof n.completed==='number')? n.completed : (n.done? Date.now(): null) };
          };
          var incoming = arr.map(normalize);

          var byId = Object.create(null);
          var sigSet = Object.create(null);
          state.forEach(function(n){ byId[n.id]=n; sigSet[n.text+'||'+n.created+'||'+n.tag]=true; });

          var added = 0, skippedSame = 0, idCollisionRenamed = 0;

          incoming.forEach(function(n){
            var sig = n.text+'||'+n.created+'||'+n.tag;
            if (byId[n.id]){
              var s = byId[n.id];
              var equal = s.text===n.text && s.tag===n.tag && s.done===n.done && s.created===n.created && s.completed===n.completed;
              if (equal){ skippedSame++; return; }
              n.id = uid(); idCollisionRenamed++;
            }
            if (sigSet[sig]){ skippedSame++; return; }
            state.push(n); byId[n.id]=n; sigSet[sig]=true; added++;
          });

          render();
          alert('Import hotov: přidáno ' + added + ', přeskočeno duplicit: ' + skippedSame + (idCollisionRenamed? (', kolizí ID vyřešeno přejmenováním: ' + idCollisionRenamed) : ''));
        }catch(err){ alert('Import se nepodařil: ' + err.message); }
      };
      reader.readAsText(file, 'utf-8');
    }

    // Validace v dialogu
    function validateTimes(createdVal, completedVal){
      var c1 = fromLocalDatetimeValue(createdVal);
      var c2 = fromLocalDatetimeValue(completedVal);
      var now = Date.now();

      if(c1 && c2 && c2 < c1){
        if(dlgError){ dlgError.textContent = 'Čas dokončení nemůže být dřívější než čas vložení.'; dlgError.hidden = false; }
      } else { if(dlgError){ dlgError.hidden = true; } }

      var future = (c1 && c1 > now) || (c2 && c2 > now);
      if (future){ if(dlgInfo){ dlgInfo.hidden = false; } } else { if(dlgInfo){ dlgInfo.hidden = true; } }

      return !(c1 && c2 && c2 < c1);
    }

    if (dlg && dlgSave){
      dlg.addEventListener('close', function(){ dlgEditingId = null; if(dlgError) dlgError.hidden = true; if(dlgInfo) dlgInfo.hidden = true; });
      if (dlgCreated) dlgCreated.addEventListener('input', function(){ validateTimes(dlgCreated.value, dlgCompleted.value); });
      if (dlgCompleted) dlgCompleted.addEventListener('input', function(){ validateTimes(dlgCreated.value, dlgCompleted.value); });

      dlgSave.addEventListener('click', function(e){
        e.preventDefault();
        if(!dlgEditingId) { dlg.close(); return; }
        if(!validateTimes(dlgCreated.value, dlgCompleted.value)){ return; }

        var note = state.find(function(n){ return n.id===dlgEditingId });
        if(!note) { dlg.close(); return; }
        var newCreated = fromLocalDatetimeValue(dlgCreated.value);
        var newCompleted = fromLocalDatetimeValue(dlgCompleted.value);
        if(newCreated) note.created = newCreated;
        note.completed = newCompleted ? newCompleted : null;
        if(note.completed && !note.done){ note.done = true; }
        save(state);
        dlg.close();
        render();
      });
    }

    // Ovládání
    if(addBtn) addBtn.addEventListener('click', function(){ addNote(input.value) });
    if(input) input.addEventListener('keydown', function(e){ if(e.key==='Enter'){ e.preventDefault(); addNote(input.value) } });
    if(exportBtn) exportBtn.addEventListener('click', exportNotes);
    if(importFile) importFile.addEventListener('change', function(){ importNotes(importFile.files[0]); importFile.value=''; });

    setAutoExportUI();
    render();
  })();
}catch(e){
  console.error('Fatální chyba aplikace:', e);
  var b = document.getElementById('fatalBanner'); if(b) b.hidden = false;
}});