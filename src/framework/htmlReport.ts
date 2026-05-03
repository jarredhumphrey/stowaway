import * as path from 'path';
import type { TraceStep } from './TraceCollector';

interface TestResult {
  suite: string;
  test: string;
  status: 'pass' | 'fail' | 'skip';
  durationMs: number;
  error?: string;
  screenshotPath?: string;
  replayVideoPath?: string;
  traceSteps?: TraceStep[];
}

// Normalize absolute/relative paths to basenames — report.html lives in the same dir.
function rel(p: string | undefined): string | undefined {
  return p ? path.basename(p) : undefined;
}

export function generateHtmlReport(results: TestResult[]): string {
  const relResults = results.map(r => ({
    ...r,
    screenshotPath: rel(r.screenshotPath),
    replayVideoPath: rel(r.replayVideoPath),
    traceSteps: r.traceSteps?.map(s => ({ ...s, screenshotPath: rel(s.screenshotPath) })),
  }));

  // Script tags don't use HTML entities — only escape the sequence that would
  // prematurely close the tag.
  const data = JSON.stringify({ results: relResults })
    .replace(/<\/script>/gi, '<\\/script>')
    .replace(/<!--/g, '<\\!--');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Stowaway — E2E Results</title>
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;height:100vh;display:flex;flex-direction:column;background:#f1f5f9;color:#1a1a1a;overflow:hidden}
#app{display:flex;flex:1;overflow:hidden}

/* Sidebar */
.sidebar{width:272px;min-width:272px;background:#16213e;color:#c9d1e0;display:flex;flex-direction:column;overflow:hidden}
.sidebar-header{padding:16px 16px 12px;border-bottom:1px solid #243356}
.app-name{font-size:14px;font-weight:700;color:#fff;letter-spacing:-0.01em}
.summary{display:flex;gap:10px;margin-top:5px;font-size:11.5px}
.s-pass{color:#4ade80}.s-fail{color:#f87171}.s-skip{color:#fbbf24}
.test-list{flex:1;overflow-y:auto;padding:6px 0}
.suite-label{padding:10px 16px 3px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#4a5a80}
.test-item{padding:6px 16px;cursor:pointer;display:flex;align-items:flex-start;gap:8px;font-size:12px;line-height:1.4;border-left:3px solid transparent;transition:background .1s}
.test-item:hover{background:#1e2d4f}
.test-item.active{background:#1e2d4f;border-left-color:#3b82f6}
.dot{width:7px;height:7px;border-radius:50%;flex-shrink:0;margin-top:3px}
.dot-pass{background:#4ade80}.dot-fail{background:#f87171}.dot-skip{background:#fbbf24}
.test-name-label{flex:1;word-break:break-word}

/* Main */
.main{flex:1;overflow-y:auto;padding:28px 32px;background:#f8fafc}
.empty{display:flex;align-items:center;justify-content:center;height:100%;color:#94a3b8;font-size:14px}

/* Test header */
.test-header{margin-bottom:16px}
.test-title{font-size:19px;font-weight:600;color:#0f172a;line-height:1.3;margin-bottom:8px}
.test-meta{display:flex;align-items:center;gap:10px;font-size:12.5px;flex-wrap:wrap}
.meta-suite{background:#e2e8f0;color:#475569;padding:2px 8px;border-radius:4px;font-size:11px}
.meta-pass{color:#16a34a;font-weight:600}.meta-fail{color:#dc2626;font-weight:600}.meta-skip{color:#d97706;font-weight:600}
.meta-dur{color:#94a3b8}

/* Error */
.error-box{background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:12px 16px;margin-bottom:20px;color:#991b1b;font-size:12.5px;font-family:'SF Mono','Fira Code',monospace;line-height:1.6;word-break:break-word}

/* Media */
.media-row{display:flex;gap:20px;margin-bottom:24px;flex-wrap:wrap;align-items:flex-start}
.section-label{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#64748b;margin-bottom:8px}
.replay-video{width:200px;border-radius:10px;box-shadow:0 4px 16px rgba(0,0,0,.12);display:block}
.failure-img{width:200px;border-radius:10px;box-shadow:0 4px 16px rgba(0,0,0,.12);cursor:pointer;display:block}

/* Steps */
.empty-trace{background:#f8fafc;border:1px dashed #cbd5e1;border-radius:8px;padding:14px 18px;color:#64748b;font-size:13px;margin-bottom:16px}
.empty-trace code{background:#e2e8f0;padding:1px 5px;border-radius:3px;font-size:12px}
.steps-wrap{margin-bottom:8px}
.steps-table{width:100%;border-collapse:collapse;font-size:12px;background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.06)}
.steps-table th{text-align:left;padding:7px 12px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#64748b;background:#f8fafc;border-bottom:1px solid #e2e8f0}
.steps-table td{padding:7px 12px;border-bottom:1px solid #f1f5f9;vertical-align:middle}
.steps-table tbody tr:last-child td{border-bottom:none}
.steps-table tbody tr:hover td{background:#f8faff}
.step-num{color:#94a3b8;width:28px;font-variant-numeric:tabular-nums;font-size:11px}
.col-target{color:#1e40af;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.col-value{color:#6b7280;font-style:italic;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.col-dur{color:#94a3b8;font-variant-numeric:tabular-nums;white-space:nowrap}
.thumb{width:36px;height:64px;object-fit:cover;border-radius:4px;cursor:pointer;border:1px solid #e2e8f0;transition:box-shadow .1s}
.thumb:hover{box-shadow:0 2px 8px rgba(0,0,0,.18)}
.no-thumb{width:36px;height:64px;background:#f8fafc;border-radius:4px;border:1px dashed #e2e8f0}

/* Badges */
.badge{display:inline-block;padding:2px 5px;border-radius:4px;font-size:9px;font-weight:800;letter-spacing:.05em;line-height:1.6;white-space:nowrap}
.bq{background:#dbeafe;color:#1d4ed8}
.bt{background:#ffedd5;color:#c2410c}
.bty{background:#dcfce7;color:#15803d}
.bs{background:#f3e8ff;color:#7e22ce}
.bf{background:#ccfbf1;color:#0f766e}
.bn{background:#f1f5f9;color:#475569}
.bd{background:#fce7f3;color:#9d174d}
.bv{background:#f0fdf4;color:#166534}
.bst{background:#fefce8;color:#854d0e;border:1px solid #fde68a}
.bnet{background:#ede9fe;color:#5b21b6}
.bex{background:#fff1f2;color:#be123c}
.assert-lbl{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#9d174d;opacity:.65;margin-right:4px;vertical-align:middle}
</style>
</head>
<body>
<div id="app"></div>
<script>window.__DATA__=${data};</script>
<script>
(function(){
var data=window.__DATA__;
var results=data.results;

var pass=results.filter(function(r){return r.status==='pass'}).length;
var fail=results.filter(function(r){return r.status==='fail'}).length;
var skip=results.filter(function(r){return r.status==='skip'}).length;

// Group by suite
var suites={};
results.forEach(function(r){
  if(!suites[r.suite])suites[r.suite]=[];
  suites[r.suite].push(r);
});

var app=document.getElementById('app');

// Sidebar
var sidebar=el('div','sidebar');
var hdr=el('div','sidebar-header');
hdr.innerHTML='<div class="app-name">Stowaway</div><div class="summary">'
  +(pass?'<span class="s-pass">'+pass+' passed</span>':'')
  +(fail?'<span class="s-fail">'+fail+' failed</span>':'')
  +(skip?'<span class="s-skip">'+skip+' skipped</span>':'')
  +'</div>';
sidebar.appendChild(hdr);

var list=el('div','test-list');
Object.keys(suites).forEach(function(suite){
  var lbl=el('div','suite-label');
  lbl.textContent=suite;
  list.appendChild(lbl);
  suites[suite].forEach(function(r){
    var item=el('div','test-item');
    item.setAttribute('data-key',r.suite+'::'+r.test);
    item.innerHTML='<span class="dot dot-'+r.status+'"></span><span class="test-name-label">'+esc(r.test)+'</span>';
    item.addEventListener('click',function(){
      document.querySelectorAll('.test-item').forEach(function(i){i.classList.remove('active')});
      item.classList.add('active');
      renderDetail(main,r);
    });
    list.appendChild(item);
  });
});
sidebar.appendChild(list);

// Main
var main=el('div','main');
main.innerHTML='<div class="empty">Select a test to view details</div>';

app.appendChild(sidebar);
app.appendChild(main);

// Auto-select first failed test
var firstFail=list.querySelector('.dot-fail');
if(firstFail)firstFail.parentElement.click();
else{var firstItem=list.querySelector('.test-item');if(firstItem)firstItem.click();}

function renderDetail(container,r){
  var statusLabel={pass:'✓ PASSED',fail:'✗ FAILED',skip:'↷ SKIPPED'}[r.status];
  var statusClass='meta-'+r.status;
  var html='<div class="test-header">'
    +'<div class="test-title">'+esc(r.test)+'</div>'
    +'<div class="test-meta">'
    +'<span class="meta-suite">'+esc(r.suite)+'</span>'
    +'<span class="'+statusClass+'">'+statusLabel+'</span>'
    +'<span class="meta-dur">'+r.durationMs+'ms</span>'
    +'</div></div>';

  if(r.error){
    html+='<div class="error-box">'+esc(r.error)+'</div>';
  }

  var hasVideo=!!r.replayVideoPath;
  var hasShot=!!r.screenshotPath;
  var hasTrace=r.traceSteps&&r.traceSteps.length>0;

  if(hasVideo||hasShot){
    html+='<div class="media-row">';
    if(hasVideo){
      html+='<div><div class="section-label">Slow Replay</div>'
        +'<video src="'+escAttr(r.replayVideoPath)+'" controls class="replay-video" preload="metadata"></video></div>';
    }
    if(hasShot){
      html+='<div><div class="section-label">Failure Screenshot</div>'
        +'<img src="'+escAttr(r.screenshotPath)+'" class="failure-img" onclick="window.open(this.src)" /></div>';
    }
    html+='</div>';
  }

  if(r.traceSteps&&r.traceSteps.length===0){
    html+='<div class="empty-trace">No app interactions were traced — this test made no <code>find()</code>, <code>tap()</code>, or similar calls.</div>';
  }

  if(hasTrace){
    html+='<div class="steps-wrap"><div class="section-label" style="margin-bottom:10px">Trace ('+r.traceSteps.length+' steps)</div>'
      +'<table class="steps-table"><thead><tr>'
      +'<th>#</th><th>Type</th><th>Value</th><th>Action</th><th>Target</th><th>Duration</th><th>Screenshot</th>'
      +'</tr></thead><tbody>';
    r.traceSteps.forEach(function(s,i){
      var base=s.action.startsWith('not.')?s.action.slice(4):s.action;
      var isAssert=EXPECT_MATCHERS.includes(base);
      var isAsync=ASYNC_ASSERT.includes(base);
      var tgtCell=s.target
        ?(isAssert?'<span class="assert-lbl">'+(isAsync?'element':'expected')+'</span>'+esc(s.target):esc(s.target))
        :'';
      var valCell=s.value
        ?(isAssert?'<span class="assert-lbl">'+(isAsync?'expected':'actual')+'</span>'+esc(s.value):esc(s.value))
        :'';
      html+='<tr>'
        +'<td class="step-num">'+(i+1)+'</td>'
        +'<td><span class="badge '+badgeCls(s.action)+'">'+badgeLbl(s.action)+'</span></td>'
        +'<td class="col-value">'+valCell+'</td>'
        +'<td>'+esc(s.action)+'</td>'
        +'<td class="col-target">'+tgtCell+'</td>'
        +'<td class="col-dur">'+s.durationMs+'ms</td>'
        +'<td>'+(s.screenshotPath
          ?'<img src="'+escAttr(s.screenshotPath)+'" class="thumb" onclick="window.open(this.src)" title="Click to expand" />'
          :'<div class="no-thumb"></div>')+'</td>'
        +'</tr>';
    });
    html+='</tbody></table></div>';
  }

  container.innerHTML=html;
}

var EXPECT_MATCHERS=['toBe','toEqual','toContain','toBeTruthy','toBeFalsy','toBeNull',
  'toBeUndefined','toBeGreaterThan','toBeGreaterThanOrEqual','toBeLessThan','toBeLessThanOrEqual',
  'toMatchObject','toHaveLength','toHaveAccessibilityLabel','toHaveAccessibilityRole',
  'toHaveText','toBeVisible','toBeEnabled','toHaveValue','toBeChecked','toBeDisabled',
  'toBeHidden','toHaveFocus'];
function badgeCls(a){
  var base=a.startsWith('not.')?a.slice(4):a;
  if(EXPECT_MATCHERS.includes(base))return'bex';
  if(['find','findAll','findNth'].includes(a))return'bq';
  if(['waitForElement','waitForGone','waitFor','scrollAndFind'].includes(a))return'bq';
  if(['tap','longPress','doubleTap'].includes(a))return'bt';
  if(['pressKey'].includes(a))return'bt';
  if(['typeText','clearText','focus','blur','submitEditing'].includes(a))return'bty';
  if(['scrollTo','scrollToX','swipe','dragTo'].includes(a))return'bs';
  if(['check','uncheck','selectOption','setDate','slideToValue'].includes(a))return'bf';
  if(['openURL','pressBack','dismissKeyboard'].includes(a))return'bn';
  if(['setStorage','getStorage','removeStorage','clearStorage','setClipboard','getClipboard'].includes(a))return'bd';
  if(['setStatusBar','resetStatusBar','setLocation','setPermission','pushNotification','disableAnimations'].includes(a))return'bv';
  if(['mockNetwork','clearNetworkMocks','setNetworkOffline','waitForRequest','waitForResponse'].includes(a))return'bnet';
  if(a==='step')return'bst';
  return'bn';
}

var LABELS={
  find:'FIND',findAll:'FIND ALL',findNth:'FIND NTH',
  waitForElement:'WAIT',waitForGone:'WAIT GONE',waitFor:'WAIT',scrollAndFind:'SCROLL+FIND',
  tap:'TAP',longPress:'LONG PRESS',doubleTap:'DOUBLE TAP',pressKey:'KEY',
  typeText:'TYPE',clearText:'CLEAR',focus:'FOCUS',blur:'BLUR',submitEditing:'SUBMIT',
  scrollTo:'SCROLL',scrollToX:'SCROLL X',swipe:'SWIPE',dragTo:'DRAG',
  check:'CHECK',uncheck:'UNCHECK',selectOption:'SELECT',setDate:'DATE',slideToValue:'SLIDE',
  openURL:'URL',pressBack:'BACK',dismissKeyboard:'KBD',
  setStorage:'STORE',getStorage:'GET STORE',removeStorage:'DEL STORE',clearStorage:'CLEAR STORE',
  setClipboard:'CLIPBOARD',getClipboard:'CLIPBOARD',
  setStatusBar:'STATUS BAR',resetStatusBar:'STATUS BAR',setLocation:'LOCATION',
  setPermission:'PERMISSION',pushNotification:'PUSH',disableAnimations:'ANIMATIONS',
  mockNetwork:'MOCK NET',clearNetworkMocks:'CLEAR NET',setNetworkOffline:'OFFLINE',
  waitForRequest:'WAIT REQ',waitForResponse:'WAIT RES',
  step:'STEP'
};
var ASYNC_ASSERT=['toHaveText','toBeVisible','toBeEnabled','toHaveValue','toBeChecked','toBeDisabled','toBeHidden','toHaveFocus'];
function badgeLbl(a){
  var base=a.startsWith('not.')?a.slice(4):a;
  if(EXPECT_MATCHERS.includes(base))return a.startsWith('not.')?'¬ ASSERT':'ASSERT';
  return LABELS[a]||a.toUpperCase();
}

function el(tag,cls){var e=document.createElement(tag);if(cls)e.className=cls;return e;}
function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function escAttr(s){return String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;');}
})();
</script>
</body>
</html>`;
}
