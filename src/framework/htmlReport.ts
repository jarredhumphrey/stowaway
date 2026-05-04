import * as path from 'path';
import type { TraceStep } from './TraceCollector';

interface TestResult {
  suite: string;
  test: string;
  status: 'pass' | 'fail' | 'skip';
  durationMs: number;
  error?: string;
  errorStack?: string;
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
.error-box{background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:12px 16px;margin-bottom:8px;color:#991b1b;font-size:12.5px;font-family:'SF Mono','Fira Code',monospace;line-height:1.6;word-break:break-word}
.stack-details{margin-bottom:20px}
.stack-details summary{font-size:11.5px;color:#94a3b8;cursor:pointer;padding:4px 2px;user-select:none}
.stack-details summary:hover{color:#64748b}
.stack-trace{margin-top:6px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:10px 14px;font-family:'SF Mono','Fira Code',monospace;font-size:11px;line-height:1.7;color:#475569;white-space:pre-wrap;word-break:break-all;overflow-x:auto}
.stack-trace .st-spec{color:#1d4ed8;font-weight:600}

/* Media */
.media-row{display:flex;gap:20px;margin-bottom:24px;flex-wrap:wrap;align-items:flex-start}
.section-label{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#64748b;margin-bottom:8px}
.replay-video{width:200px;border-radius:10px;box-shadow:0 4px 16px rgba(0,0,0,.12);display:block}
.failure-img{width:200px;border-radius:10px;box-shadow:0 4px 16px rgba(0,0,0,.12);cursor:pointer;display:block}

/* Steps */
.empty-trace{background:#f8fafc;border:1px dashed #cbd5e1;border-radius:8px;padding:14px 18px;color:#64748b;font-size:13px;margin-bottom:16px}
.empty-trace code{background:#e2e8f0;padding:1px 5px;border-radius:3px;font-size:12px}
.steps-wrap{margin-bottom:8px}
.trace-list{background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.06);padding:4px 0}
.trace-row{display:flex;align-items:center;gap:10px;padding:7px 14px;border-bottom:1px solid #f1f5f9;font-size:13px;line-height:1.5;border-left:3px solid transparent}
.trace-row:last-child{border-bottom:none}
.trace-row:hover{background:#f8faff}
.trace-row--step{background:#fafaf7;border-bottom-color:#ede9e0}
.trace-row--failed{background:#fff5f5;border-left-color:#fca5a5}
.trace-row--step.trace-row--failed{background:#fff1f1}
.trace-num{color:#94a3b8;font-size:11px;width:36px;text-align:right;flex-shrink:0;font-variant-numeric:tabular-nums;white-space:nowrap}
.trace-badge{flex-shrink:0}
.trace-sentence{flex:1;color:#334155}
.trace-row--failed .trace-sentence{color:#991b1b}
.trace-val{font-family:'SF Mono','Fira Code',monospace;font-size:11.5px;background:#f1f5f9;padding:1px 5px;border-radius:3px;color:#0f172a}
.trace-dur{color:#94a3b8;font-size:11px;white-space:nowrap;flex-shrink:0;font-variant-numeric:tabular-nums}
.trace-thumb{width:32px;height:56px;object-fit:cover;border-radius:4px;cursor:pointer;border:1px solid #e2e8f0;flex-shrink:0;transition:box-shadow .1s}
.trace-thumb:hover{box-shadow:0 2px 8px rgba(0,0,0,.18)}
.trace-nothumb{width:32px;flex-shrink:0}

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
    if(r.errorStack){
      html+='<details class="stack-details"><summary>Stack trace</summary>'
        +'<pre class="stack-trace">'+formatStack(r.errorStack)+'</pre></details>';
    }
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
      +'<div class="trace-list">';
    var topNum=0,subCount=0;
    r.traceSteps.forEach(function(s){
      var depth=s.depth||0;
      var numLabel;
      if(depth===0){topNum++;subCount=0;numLabel=topNum+'.';}
      else{subCount++;numLabel=topNum+subLetter(subCount)+'.';}
      var cls='trace-row';
      if(s.action==='step')cls+=' trace-row--step';
      if(s.failed)cls+=' trace-row--failed';
      var indent=depth>0?'padding-left:'+(14+depth*18)+'px':'';
      html+='<div class="'+cls+'"'+(indent?' style="'+indent+'"':'')+'>'
        +'<span class="trace-num">'+numLabel+'</span>'
        +'<span class="badge trace-badge '+badgeCls(s.action)+'">'+badgeLbl(s.action)+'</span>'
        +'<span class="trace-sentence">'+renderSentence(s)+'</span>'
        +'<span class="trace-dur">'+s.durationMs+'ms</span>'
        +(s.screenshotPath
          ?'<img src="'+escAttr(s.screenshotPath)+'" class="trace-thumb" onclick="window.open(this.src)" title="Click to expand" />'
          :'<span class="trace-nothumb"></span>')
        +'</div>';
    });
    html+='</div></div>';
  }

  container.innerHTML=html;
}

function renderSentence(s){
  function val(x){return x?'<code class="trace-val">'+esc(x)+'</code>':'';}
  var t=val(s.target),v=val(s.value);
  var base=s.action.startsWith('not.')?s.action.slice(4):s.action;
  var neg=s.action.startsWith('not.');
  var n=neg?' not':'';
  switch(base){
    // sync assertions — target = expected value, value = actual
    case 'toBe':                  return'Expect '+v+n+' to be '+t;
    case 'toEqual':               return'Expect '+v+n+' to equal '+t;
    case 'toContain':             return'Expect '+v+n+' to contain '+t;
    case 'toBeTruthy':            return'Expect '+v+n+' to be truthy';
    case 'toBeFalsy':             return'Expect '+v+n+' to be falsy';
    case 'toBeNull':              return'Expect '+v+n+' to be null';
    case 'toBeUndefined':         return'Expect '+v+n+' to be undefined';
    case 'toBeGreaterThan':       return'Expect '+v+n+' to be greater than '+t;
    case 'toBeGreaterThanOrEqual':return'Expect '+v+n+' to be greater than or equal to '+t;
    case 'toBeLessThan':          return'Expect '+v+n+' to be less than '+t;
    case 'toBeLessThanOrEqual':   return'Expect '+v+n+' to be less than or equal to '+t;
    case 'toMatchObject':         return'Expect '+v+n+' to match '+t;
    case 'toHaveLength':          return'Expect '+v+n+' to have length '+t;
    case 'toHaveAccessibilityLabel':return'Expect '+v+n+' to have accessibility label '+t;
    case 'toHaveAccessibilityRole': return'Expect '+v+n+' to have accessibility role '+t;
    // async element assertions — target = element label, value = expected
    case 'toHaveText':    return'Expect '+t+n+' to have text '+v;
    case 'toBeVisible':   return'Expect '+t+n+' to be visible';
    case 'toBeEnabled':   return'Expect '+t+n+' to be enabled';
    case 'toHaveValue':   return'Expect '+t+n+' to have value '+v;
    case 'toBeChecked':   return'Expect '+t+n+' to be checked';
    case 'toBeDisabled':  return'Expect '+t+n+' to be disabled';
    case 'toBeHidden':    return'Expect '+t+n+' to be hidden';
    case 'toHaveFocus':   return'Expect '+t+n+' to have focus';
  }
  switch(s.action){
    case 'find':            return'Find '+t;
    case 'findAll':         return'Find all '+t;
    case 'findNth':         return'Find '+t+(v?' ('+esc(s.value)+')':'');
    case 'waitForElement':  return'Wait for '+t;
    case 'waitForGone':     return'Wait for '+t+' to disappear';
    case 'waitFor':         return'Wait for condition'+(t?' '+t:'');
    case 'scrollAndFind':   return'Scroll and find '+t;
    case 'tap':             return'Tap '+t;
    case 'longPress':       return'Long press '+t;
    case 'doubleTap':       return'Double tap '+t;
    case 'pressKey':        return'Press key '+v+' on '+t;
    case 'typeText':        return'Type '+v+' into '+t;
    case 'clearText':       return'Clear text in '+t;
    case 'focus':           return'Focus '+t;
    case 'blur':            return'Blur '+t;
    case 'submitEditing':   return'Submit editing on '+t;
    case 'scrollTo':        return'Scroll '+t+' to '+v;
    case 'scrollToX':       return'Scroll '+t+' horizontally to '+v;
    case 'swipe':           return'Swipe '+v+' on '+t;
    case 'dragTo':          return'Drag '+t+' '+v;
    case 'check':           return'Check '+t;
    case 'uncheck':         return'Uncheck '+t;
    case 'selectOption':    return'Select '+v+' in '+t;
    case 'setDate':         return'Set date to '+v+' on '+t;
    case 'slideToValue':    return'Slide '+t+' to '+v;
    case 'openURL':         return'Open URL '+t;
    case 'pressBack':       return'Press back';
    case 'dismissKeyboard': return'Dismiss keyboard';
    case 'setStorage':      return'Set '+t+' in storage to '+v;
    case 'getStorage':      return'Read '+t+' from storage';
    case 'removeStorage':   return'Remove '+t+' from storage';
    case 'clearStorage':    return'Clear all storage';
    case 'setClipboard':    return'Copy '+v+' to clipboard';
    case 'getClipboard':    return'Read clipboard';
    case 'setStatusBar':    return'Set status bar'+(v?' to '+v:'');
    case 'resetStatusBar':  return'Reset status bar';
    case 'setLocation':     return'Set location to '+v;
    case 'setPermission':   return'Set '+t+' permission to '+v;
    case 'pushNotification':return'Push notification';
    case 'disableAnimations':return'Disable animations';
    case 'mockNetwork':     return'Mock network '+t;
    case 'clearNetworkMocks':return'Clear network mocks';
    case 'setNetworkOffline':return'Set network '+(s.value==='true'?'offline':'online');
    case 'waitForRequest':  return'Wait for request '+t;
    case 'waitForResponse': return'Wait for response '+t;
    case 'step':            return'Step: '+(t||'')+(s.value?' — '+esc(s.value):'');
  }
  // fallback: split camelCase into words
  var words=s.action.replace(/([A-Z])/g,' $1');
  words=words.charAt(0).toUpperCase()+words.slice(1).toLowerCase();
  return words+(t?' '+t:'')+(v?' ('+v+')':'');
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
function badgeLbl(a){
  var base=a.startsWith('not.')?a.slice(4):a;
  if(EXPECT_MATCHERS.includes(base))return a.startsWith('not.')?'¬ ASSERT':'ASSERT';
  return LABELS[a]||a.toUpperCase();
}

function formatStack(stack){
  return stack.split('\\n').map(function(line){
    var escaped=esc(line);
    return /\\.spec\\.[tj]sx?|e2e\\//.test(line)
      ?'<span class="st-spec">'+escaped+'</span>'
      :escaped;
  }).join('\\n');
}
function subLetter(n){var r='';while(n>0){n--;r=String.fromCharCode(97+(n%26))+r;n=Math.floor(n/26);}return r;}
function el(tag,cls){var e=document.createElement(tag);if(cls)e.className=cls;return e;}
function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function escAttr(s){return String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;');}
})();
</script>
</body>
</html>`;
}
