// Cold-sales steps for the pipeline screen (see STEPS_COLD in pipeline.js).
// Everything shown comes from the server's analysis of the uploaded list
// (server/lib/cold.js): POST /api/runs/upload creates the run from the file,
// or POST /api/runs with mode 'cold_sales' uses the built-in sample list.
const BUCKET_COLOR = { hot: 'var(--amber)', warm: 'var(--green)', cold: 'var(--purple)' };
const BUCKET_LABEL = { hot: 'Hot', warm: 'Warm', cold: 'Cold' };
const UPLOAD_ERRORS = {
  unsupported: 'Upload an .xlsx or .csv file.',
  old_excel: 'Old .xls files are not supported — save the sheet as .xlsx or .csv.',
  file_too_large: 'The file is larger than 5 MB.',
};
const bucketChip = (b) => '<span class="bucket-chip" style="--c:' + BUCKET_COLOR[b] + '">' + BUCKET_LABEL[b] + '</span>';

/* ---------- 1. Upload ---------- */
function renderUpload(panel){
  if(pipe.data) return renderIntake(panel);
  panel.innerHTML =
    '<h2>Upload the prospect list</h2>' +
    '<div class="desc">An Excel or CSV export with one row per prospect. Only <b>name</b> and <b>phone</b> are required &mdash; everything else sharpens the strategy. Column names don&#8217;t need to match exactly (&#8220;Mobile No.&#8221;, &#8220;CIBIL Score&#8221; and &#8220;Monthly Salary&#8221; are all recognised).</div>' +
    '<div class="upload-grid step-fill">' +
      '<label class="dropzone" id="dropzone" for="listFile">' +
        '<input type="file" id="listFile" accept=".xlsx,.csv" hidden>' +
        '<div class="dz-icon" aria-hidden="true">⇪</div>' +
        '<div class="dz-title">Drop your list here, or click to choose a file</div>' +
        '<div class="dz-sub">.xlsx or .csv &middot; up to 1,000 rows &middot; 5 MB</div>' +
        '<div class="dz-status" id="dzStatus" role="status"></div>' +
      '</label>' +
      '<div class="upload-side">' +
        '<div class="m-panel-title">Columns we look for</div>' +
        '<table class="cols"><tbody>' +
          [['Name', 'Required'], ['Phone / Mobile', 'Required'], ['CIBIL score', 'Product tier + bucket'], ['City / State', 'Language inference'],
           ['Age', 'Hinglish vs regional language'], ['Monthly income', 'Product tier + amount'], ['Occupation', 'When to call + product'],
           ['Preferred language', 'Overrides inference'], ['DND', 'Rows marked Yes are skipped']]
            .map(([c, u]) => '<tr><td>' + c + '</td><td class="dim">' + u + '</td></tr>').join('') +
        '</tbody></table>' +
        '<div class="upload-actions">' +
          '<button class="btn-next" id="btnSample" type="button">Use the sample list</button>' +
          '<a class="btn-ghost" href="/api/cold/sample.csv" download>Download sample (.csv)</a>' +
        '</div>' +
        '<div class="footnote">The sample is a fictional list of 40 prospects, including a bad number, a duplicate, two DND rows and three below the CIBIL cutoff.</div>' +
      '</div>' +
    '</div>';
  const input = document.getElementById('listFile');
  const dz = document.getElementById('dropzone');
  input.addEventListener('change', () => { if(input.files[0]) uploadList(input.files[0]); });
  dz.addEventListener('dragover', (e) => { e.preventDefault(); dz.classList.add('over'); });
  dz.addEventListener('dragleave', () => dz.classList.remove('over'));
  dz.addEventListener('drop', (e) => { e.preventDefault(); dz.classList.remove('over'); if(e.dataTransfer.files[0]) uploadList(e.dataTransfer.files[0]); });
  document.getElementById('btnSample').onclick = useSampleList;
}

function setUploadStatus(html, isError){
  const el = document.getElementById('dzStatus');
  if(!el) return;
  el.innerHTML = html;
  el.classList.toggle('err', !!isError);
}

async function uploadList(file){
  setUploadStatus('Reading <b>' + escHtml(file.name) + '</b>…');
  const q = new URLSearchParams({ filename: file.name, voiceId: state.voice.id, name: state.name });
  try {
    const res = await fetch('/api/runs/upload?' + q, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: file });
    const body = await res.json().catch(() => ({}));
    if(!res.ok) return setUploadStatus(uploadErrorText(body), true);
    await adoptRun(body);
    renderPipeline();
  } catch(e) {
    setUploadStatus('Couldn&#8217;t upload the list — check your connection and try again.', true);
  }
}

async function useSampleList(){
  setUploadStatus('Loading the sample list…');
  try {
    const res = await fetch('/api/runs', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: state.name, voiceId: state.voice.id, mode: 'cold_sales' }) });
    if(!res.ok) throw new Error('runs ' + res.status);
    await adoptRun(await res.json());
    renderPipeline();
  } catch(e) {
    setUploadStatus('Couldn&#8217;t load the sample list — try again.', true);
  }
}

function uploadErrorText(body){
  if(body.error === 'no_eligible_leads' && body.intake){
    const reasons = body.intake.excludedByReason.filter(r => r.count).map(r => r.count + ' × ' + escHtml(r.label.toLowerCase())).join(', ');
    return 'None of the ' + body.intake.received + ' rows can be called' + (reasons ? ': ' + reasons : '') + '. Check the phone column.';
  }
  return escHtml(body.message || UPLOAD_ERRORS[body.error] || 'Couldn’t read that file.');
}

// After a list is in: what we received, what we recognised, what's missing.
function renderIntake(panel){
  const i = pipe.data.intake;
  const tile = (v, k, cls) => '<div class="f-stat ' + (cls || '') + '"><div class="v">' + v + '</div><div class="k">' + k + '</div></div>';
  panel.innerHTML =
    '<h2>List received</h2>' +
    '<div class="desc">' + i.received + ' rows read. ' + (i.truncated ? 'This demo run dispatches the top ' + i.dispatched + ' by fit score. ' : '') + 'Next, every row is checked before anyone gets a call.</div>' +
    '<div class="intake-tiles">' + tile(i.received, 'Rows received') + tile(i.valid, 'Callable', 'good') + tile(i.excludedCount, 'Excluded', i.excludedCount ? 'bad' : '') + '</div>' +
    '<div class="intake-grid step-fill">' +
      '<div class="intake-box"><div class="m-panel-title">Columns recognised</div>' +
        i.detected.map(d => '<div class="col-map"><span class="mono">' + escHtml(d.column) + '</span><span class="dim">→</span><span>' + escHtml(d.field) + '</span></div>').join('') +
        (i.ignored.length ? '<div class="footnote">Ignored: ' + i.ignored.map(escHtml).join(', ') + '</div>' : '') + '</div>' +
      '<div class="intake-box"><div class="m-panel-title">Gaps in the callable rows</div>' +
        [['cibil', 'No CIBIL score — bureau pull pending, scored conservatively'], ['income', 'No income'], ['occupation', 'No occupation — default call window'], ['language', 'No language — inferred from location']]
          .map(([k, label]) => '<div class="col-map"><span class="mono">' + i.missing[k] + '</span><span>' + label + '</span></div>').join('') + '</div>' +
    '</div>' +
    '<div class="nav-btns"><button class="btn-ghost" id="btnNewList" type="button">Use a different list</button><button class="btn-next" id="btnUploadNext" type="button">Next: Validation →</button></div>';
  document.getElementById('btnUploadNext').onclick = nextStep;
  document.getElementById('btnNewList').onclick = () => { teardownRun(); state.run = null; pipe.data = null; pipe.max = 0; pipe.done = {}; renderPipeline(); };
}

/* ---------- 2. Validation ---------- */
function renderValidate(panel){
  const v = pipe.data.validation, b = pipe.data.buckets;
  panel.innerHTML =
    '<h2>Validation &amp; clean-up</h2>' +
    '<div class="desc">Before strategy, the list is cleaned: numbers normalised, duplicates and Do-Not-Call rows removed, and the CIBIL policy cutoff applied. Excluded rows are listed with the reason &mdash; nobody is dropped silently.</div>' +
    '<div class="validate-grid step-fill">' +
      '<div><div class="meter wide"><div class="meter-fill" id="procMeter"></div></div><div class="checklist wide">' + checklist(v.tasks, 'task-') + '</div>' +
        '<div class="footnote">' + escHtml(v.note) + '</div></div>' +
      '<div class="table-scroll"><table><thead><tr><th>Row</th><th>Prospect</th><th>Phone</th><th>Excluded because</th></tr></thead><tbody>' +
        (b.excluded.map(e => '<tr><td class="mono dim">' + e.row + '</td><td>' + escHtml(e.name) + '</td><td class="mono dim">' + escHtml(e.phoneMasked) + '</td><td class="bad-text">' + escHtml(e.reasonLabel) + '</td></tr>').join('')
          || '<tr><td colspan="4" class="dim">Every row passed — nothing excluded.</td></tr>') +
      '</tbody></table></div>' +
    '</div><div id="procNav"></div>';
  const finish = () => {
    document.getElementById('procNav').innerHTML = navBar('Next: Product fit →', 'btnValNext');
    document.getElementById('btnValNext').onclick = nextStep;
  };
  if(pipe.done.validate){ v.tasks.forEach((_, i) => tick('task-' + i)); return finish(); }
  v.tasks.forEach((_, i) => later(() => {
    tick('task-' + i);
    if(i === v.tasks.length - 1){ pipe.done.validate = true; finish(); }
  }, (i + 1) * 450));
}

/* ---------- 3. Product fit ---------- */
function renderFit(panel){
  const f = pipe.data.fit;
  panel.innerHTML =
    '<h2>Product fit</h2>' +
    '<div class="desc">With no bank relationship to read, the product comes from what the list carries &mdash; occupation picks the product family, CIBIL and income pick the tier and an indicative amount.</div>' +
    '<div class="model-box"><div class="model-box-label">How fit is derived for a cold list</div><div class="model-steps">' +
      f.model.map(m => '<div class="model-step"><b>' + escHtml(m.title) + '</b><span>' + escHtml(m.body) + '</span></div>').join('') + '</div></div>' +
    '<div class="table-scroll step-fill"><table><thead><tr><th>Prospect</th><th>CIBIL</th><th>Income</th><th>Occupation</th><th>Product</th><th>Why</th><th>Indicative</th><th>Fit</th></tr></thead><tbody>' +
      f.rows.map(r => '<tr><td>' + escHtml(r.name) + '<div class="mono dim sm">' + escHtml(r.phoneMasked) + '</div></td><td class="mono">' + escHtml(r.cibilDisplay) + '</td>' +
        '<td class="mono dim">' + escHtml(r.incomeDisplay) + '</td><td>' + escHtml(r.occupationLabel) + '</td><td>' + escHtml(r.need) + '</td>' +
        '<td class="why">' + escHtml(r.why) + '</td><td class="mono gold">' + escHtml(r.eligibleDisplay) + '</td><td class="mono dim">' + r.score + '</td></tr>').join('') +
    '</tbody></table></div>' +
    '<div class="footnote">Indicative amounts are a starting band for the pitch; the bank&#8217;s underwriting sets the final number after the bureau pull.</div>' +
    navBar('Next: Buckets →', 'btnFitNext');
  document.getElementById('btnFitNext').onclick = nextStep;
}

/* ---------- 4. Buckets ---------- */
function renderColdBuckets(panel){
  const b = pipe.data.buckets;
  panel.innerHTML =
    '<h2>Buckets</h2>' +
    '<div class="desc">Prospects are split by fit score. The bucket decides how hard to push: Hot leads are called first and get more attempts; Warm and Cold get an intro message before the call and fewer attempts.</div>' +
    '<div class="buckets five">' + b.buckets.map(col =>
      '<div class="bucket-col" style="--c:' + BUCKET_COLOR[col.key] + '"><h3>' + bucketChip(col.key) + ' ' + col.rows.length + ' prospects</h3>' +
      '<div class="bucket-range">' + escHtml(col.rule) + ' &middot; ' + escHtml(col.plan) + '</div>' +
      '<div class="bucket-list">' + (col.rows.map(r => '<div class="bucket-card"><div class="nm">' + escHtml(r.name) + '<div class="dim sm">' + escHtml(r.need) + '</div></div><div class="nd">' + r.score + '</div></div>').join('') || '<div class="bucket-card nd">None</div>') + '</div></div>').join('') +
      '<div class="bucket-col excluded"><h3>Excluded ' + b.excluded.length + '</h3><div class="bucket-range">Not called</div><div class="bucket-list">' +
        (b.excluded.map(e => '<div class="bucket-card"><div class="nm">' + escHtml(e.name) + '<div class="bad-text sm">' + escHtml(e.reasonLabel) + '</div></div></div>').join('') || '<div class="bucket-card nd">None</div>') +
      '</div></div>' +
    '</div>' +
    navBar('Next: Contact strategy →', 'btnBucketNext');
  document.getElementById('btnBucketNext').onclick = nextStep;
}

/* ---------- 5. Contact strategy: when, how, which language ---------- */
function renderContact(panel){
  const c = pipe.data.contact;
  panel.innerHTML =
    '<h2>Contact strategy</h2>' +
    '<div class="desc">For each prospect: <b>when</b> to call (from occupation), <b>how</b> to call (from the bucket) and <b>which language</b> (from the list, or inferred from location). ' + escHtml(c.note) + '</div>' +
    '<div class="pitch-grid step-fill"><div class="table-scroll"><table><thead><tr><th>Prospect</th><th>Bucket</th><th>Language</th><th>When</th><th>How</th></tr></thead><tbody id="contactRows"></tbody></table></div><div id="contactDetail"></div></div>' +
    navBar('Next: Campaigns →', 'btnContactNext');
  document.getElementById('btnContactNext').onclick = nextStep;
  const rowsEl = document.getElementById('contactRows');
  const row = (k, v, sub) => '<div class="pitch-row"><span class="k">' + k + '</span><span class="v">' + v + (sub ? '<div class="pr-sub">' + sub + '</div>' : '') + '</span></div>';
  function draw(){
    rowsEl.innerHTML = c.rows.map((r, i) => '<tr class="clickable' + (i === pipe.pitchIdx ? ' selected' : '') + '" data-i="' + i + '"><td>' + escHtml(r.name) + '</td><td>' + bucketChip(r.bucket) + '</td>' +
      '<td>' + escHtml(r.callLanguage) + (r.callLanguage !== r.language ? ' <span class="dim">(' + escHtml(r.language) + ')</span>' : '') + '</td><td class="dim">' + escHtml(r.when) + '</td><td class="dim">' + escHtml(r.how) + '</td></tr>').join('');
    rowsEl.querySelectorAll('tr').forEach(tr => tr.addEventListener('click', () => { pipe.pitchIdx = parseInt(tr.dataset.i, 10); draw(); }));
    const r = c.rows[Math.min(pipe.pitchIdx, c.rows.length - 1)];
    const bridged = r.callLanguage !== r.language;
    document.getElementById('contactDetail').innerHTML =
      row('Prospect', escHtml(r.name), '<span class="mono">' + escHtml(r.phoneMasked) + '</span>') +
      row('Bucket', bucketChip(r.bucket)) +
      row('Product', escHtml(r.need) + ' · <span class="gold">' + escHtml(r.eligibleDisplay) + '</span>') +
      row('Preferred language', escHtml(r.language), escHtml(r.languageSource)) +
      row('Call language', escHtml(r.callLanguage), bridged ? 'No ' + escHtml(r.language) + ' agent yet — English as the bridge language' : 'Matches the prospect') +
      row('Agent', escHtml(r.agent)) +
      row('When', escHtml(r.when), escHtml(r.whenWhy)) +
      row('How', escHtml(r.how), escHtml(r.howWhy)) +
      row('Call attempts', String(r.maxAttempts));
  }
  draw();
}

/* ---------- 6. Campaigns ---------- */
function renderColdBatching(panel){
  const b = pipe.data.batching;
  const lead = state.run.voice;
  panel.innerHTML =
    '<h2>Campaigns</h2>' +
    '<div class="desc">Prospects grouped by bucket, their own language and time slot &mdash; one script and one send window per campaign. <b>' + escHtml(lead.name) + '</b> takes ' + b.matchedLeads + ' of ' + b.totalLeads +
      ' prospects; ' + b.routedLeads + ' are routed to the agent who speaks their language. Each campaign also shows the best voices for its region from the agent library &mdash; including voices that could call bridged prospects in their own language. ' +
      '<button type="button" class="link-btn" data-open-library>Browse the agent library →</button></div>' +
    '<div class="board step-fill">' + b.batches.map(p =>
      '<div class="persona' + (p.agent !== lead.name ? ' routed' : '') + '">' +
      '<div class="lang">' + bucketChip(p.bucket) + ' ' + escHtml(p.language) + (p.callLanguage !== p.language ? ' · called in ' + escHtml(p.callLanguage) : '') + '</div><div class="name">' + escHtml(p.when) + '</div>' +
      '<div class="count">' + p.count + '<small>' + (p.count === 1 ? 'prospect' : 'prospects') + '</small></div>' +
      '<div class="status">' + escHtml(p.how) + '</div>' +
      '<div class="status agent">Agent: ' + (pickedFor(p.library) ? escHtml(pickedFor(p.library).name) + ' (picked from library)' : escHtml(p.agent) + (p.agent !== lead.name ? ' (routed by language)' : '')) + '</div>' +
      libraryBlock(p.library) + '</div>').join('') + '</div>' +
    navBar('Next: Launch the campaigns →', 'btnColdBatchNext');
  document.getElementById('btnColdBatchNext').onclick = nextStep;
}
