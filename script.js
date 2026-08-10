document.getElementById('fileNo').textContent = 'JOB #' + Math.floor(1000+Math.random()*9000);

const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('fileInput');
const fileErr = document.getElementById('fileErr');
const imgList = document.getElementById('imgList');
const optsRow = document.getElementById('optsRow');
const optDivider = document.getElementById('optDivider');
const runBtn = document.getElementById('runBtn');

let images = []; // {id, file, dataUrl, width, height}
let idCounter = 0;
let draggedId = null;

// ---------- input wiring ----------
dropzone.addEventListener('click', ()=>fileInput.click());
dropzone.addEventListener('dragover', e=>{e.preventDefault(); dropzone.classList.add('drag');});
dropzone.addEventListener('dragleave', ()=>dropzone.classList.remove('drag'));
dropzone.addEventListener('drop', e=>{
  e.preventDefault(); dropzone.classList.remove('drag');
  if(e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
});
fileInput.addEventListener('change', e=>{
  if(e.target.files.length) handleFiles(e.target.files);
  fileInput.value = '';
});

function handleFiles(fileList){
  fileErr.classList.remove('show');
  const valid = [...fileList].filter(f=>f.type.startsWith('image/'));
  if(valid.length !== fileList.length){
    fileErr.textContent = "Some files were skipped — only image files (JPG, PNG, WEBP, HEIC) are supported.";
    fileErr.classList.add('show');
  }
  valid.forEach(file=>{
    const id = idCounter++;
    const reader = new FileReader();
    reader.onload = e=>{
      const img = new Image();
      img.onload = ()=>{
        images.push({id, file, dataUrl:e.target.result, width:img.naturalWidth, height:img.naturalHeight});
        renderList();
        validateReady();
      };
      img.onerror = ()=>{
        fileErr.textContent = "Couldn't read one of the images — try a different file.";
        fileErr.classList.add('show');
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

function renderList(){
  imgList.innerHTML = '';
  images.forEach((item, idx)=>{
    const row = document.createElement('div');
    row.className = 'img-item';
    row.draggable = true;
    row.dataset.id = item.id;

    row.innerHTML = `
      <span class="handle">⠿</span>
      <img class="thumb" src="${item.dataUrl}" alt="">
      <div class="meta">
        <div class="name">${escapeHtml(item.file.name)}</div>
        <div class="dims">${item.width}×${item.height}</div>
      </div>
      <span class="order-badge">PAGE ${idx+1}</span>
      <button class="remove" title="Remove" data-id="${item.id}">×</button>
    `;

    row.addEventListener('dragstart', ()=>{ draggedId = item.id; row.classList.add('dragging'); });
    row.addEventListener('dragend', ()=>{ row.classList.remove('dragging'); imgList.querySelectorAll('.img-item').forEach(el=>el.classList.remove('drag-over')); });
    row.addEventListener('dragover', e=>{ e.preventDefault(); row.classList.add('drag-over'); });
    row.addEventListener('dragleave', ()=> row.classList.remove('drag-over'));
    row.addEventListener('drop', e=>{
      e.preventDefault();
      row.classList.remove('drag-over');
      if(draggedId===null || draggedId===item.id) return;
      const fromIdx = images.findIndex(i=>i.id===draggedId);
      const toIdx = images.findIndex(i=>i.id===item.id);
      const [moved] = images.splice(fromIdx,1);
      images.splice(toIdx,0,moved);
      renderList();
    });

    row.querySelector('.remove').addEventListener('click', ()=>{
      images = images.filter(i=>i.id!==item.id);
      renderList();
      validateReady();
    });

    imgList.appendChild(row);
  });

  const hasImages = images.length>0;
  optsRow.style.display = hasImages ? 'grid' : 'none';
  optDivider.style.display = hasImages ? 'block' : 'none';
}

function escapeHtml(s){
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

function validateReady(){
  runBtn.disabled = images.length===0;
}

// ---------- build pdf ----------
runBtn.addEventListener('click', buildPdf);
document.getElementById('resetBtn').addEventListener('click', ()=>{
  document.getElementById('results').classList.remove('show');
  window.scrollTo({top:0, behavior:'smooth'});
});

const MARGIN_PT = { none:0, small:24, large:56 };
const PAGE_PT = {
  a4: {w:595.28, h:841.89},
  letter: {w:612, h:792}
};

async function buildPdf(){
  const overlay = document.getElementById('scanOverlay');
  const status = document.getElementById('scanStatus');
  overlay.classList.add('show');
  runBtn.disabled = true;
  document.getElementById('results').classList.remove('show');

  await new Promise(r=>setTimeout(r, 50)); // let overlay paint
  status.textContent = 'Laying out pages…';

  try{
    const { jsPDF } = window.jspdf;
    const sizeChoice = document.getElementById('pageSize').value;
    const orientChoice = document.getElementById('orientation').value;
    const marginChoice = document.getElementById('margin').value;
    const margin = MARGIN_PT[marginChoice];

    let doc = null;

    for(let i=0;i<images.length;i++){
      const item = images[i];
      status.textContent = `Placing image ${i+1} of ${images.length}…`;
      await new Promise(r=>setTimeout(r, 10));

      const imgIsLandscape = item.width >= item.height;
      let orientation = orientChoice === 'auto' ? (imgIsLandscape ? 'landscape':'portrait') : orientChoice;

      let pageW, pageH;
      if(sizeChoice === 'fit'){
        pageW = item.width + margin*2;
        pageH = item.height + margin*2;
        orientation = pageW >= pageH ? 'landscape':'portrait';
      } else {
        const base = PAGE_PT[sizeChoice];
        if(orientation==='landscape'){ pageW = base.h; pageH = base.w; }
        else { pageW = base.w; pageH = base.h; }
      }

      const format = sizeChoice==='fit' ? [pageW, pageH] : sizeChoice;

      if(doc===null){
        doc = new jsPDF({ orientation, unit:'pt', format });
      } else {
        doc.addPage(format, orientation);
      }

      const availW = pageW - margin*2;
      const availH = pageH - margin*2;
      const scale = Math.min(availW/item.width, availH/item.height);
      const drawW = item.width*scale;
      const drawH = item.height*scale;
      const x = (pageW-drawW)/2;
      const y = (pageH-drawH)/2;

      const fmt = item.file.type.includes('png') ? 'PNG' : 'JPEG';
      doc.addImage(item.dataUrl, fmt, x, y, drawW, drawH, undefined, 'FAST');
    }

    status.textContent = 'Finalizing…';
    await new Promise(r=>setTimeout(r, 100));

    const blob = doc.output('blob');
    const url = URL.createObjectURL(blob);
    const downloadBtn = document.getElementById('downloadBtn');
    downloadBtn.href = url;
    document.getElementById('pageCountText').textContent = images.length + (images.length===1 ? ' page' : ' pages');

    const results = document.getElementById('results');
    results.classList.add('show');
    const stamp = document.getElementById('stamp');
    stamp.style.animation = 'none'; void stamp.offsetWidth; stamp.style.animation = '';
    setTimeout(()=>burstConfetti(document.getElementById('stampRow')), 60);
    results.scrollIntoView({behavior:'smooth', block:'start'});

  }catch(err){
    fileErr.textContent = "Something went wrong building the PDF — try removing the largest image and running again.";
    fileErr.classList.add('show');
  } finally {
    overlay.classList.remove('show');
    runBtn.disabled = false;
  }
}

function burstConfetti(container){
  const emojis = ['✨','🔥','💫','⭐','📄','🎉'];
  for(let i=0;i<14;i++){
    const el = document.createElement('span');
    el.className = 'confetti';
    el.textContent = emojis[Math.floor(Math.random()*emojis.length)];
    const angle = Math.random()*Math.PI*2;
    const dist = 60 + Math.random()*70;
    el.style.setProperty('--dx', Math.cos(angle)*dist + 'px');
    el.style.setProperty('--dy', Math.sin(angle)*dist + 'px');
    el.style.setProperty('--rot', (Math.random()*360-180) + 'deg');
    el.style.animationDelay = (Math.random()*0.15) + 's';
    container.appendChild(el);
    setTimeout(()=>el.remove(), 1100);
  }
}
