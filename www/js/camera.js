// Живая камера с таймером. Работает по https:// или на localhost.
// Cam.open({facing:'environment'|'user', guide:'body'|'face', title}) -> Promise<HTMLCanvasElement|null>
const Cam=(()=>{
  const $=id=>document.getElementById(id);
  let stream=null,facing='environment',done=null,ticking=null,lastFocus=null,audio=null;
  const supported=()=>!!(window.isSecureContext&&navigator.mediaDevices&&navigator.mediaDevices.getUserMedia);
  const msg=t=>{$('camMsg').textContent=t};
  function beep(hi){try{audio=audio||new (window.AudioContext||window.webkitAudioContext)();const o=audio.createOscillator(),g=audio.createGain();
    o.frequency.value=hi?1320:880;g.gain.value=.08;o.connect(g);g.connect(audio.destination);o.start();o.stop(audio.currentTime+(hi?.25:.09))}catch(e){}}
  function stop(){if(stream){stream.getTracks().forEach(t=>t.stop());stream=null}$('camVideo').srcObject=null}
  async function start(){
    stop();msg('Включаю камеру…');
    try{
      stream=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:facing},width:{ideal:1920},height:{ideal:1920}}});
      const v=$('camVideo');v.srcObject=stream;v.classList.toggle('mirror',facing==='user');await v.play();msg('');
    }catch(e){
      msg(e&&e.name==='NotAllowedError'?'Нет доступа к камере. Разрешите камеру в настройках браузера для этого сайта.':
          e&&e.name==='NotFoundError'?'Камера не найдена.':'Не удалось включить камеру. Используйте кнопку «Сфотографировать» или «Выбрать фото».');
    }
  }
  function close(result=null){clearInterval(ticking);ticking=null;$('camCount').textContent='';stop();$('cam').hidden=true;
    if(lastFocus&&lastFocus.focus)lastFocus.focus();const d=done;done=null;if(d)d(result)}
  function capture(){
    const v=$('camVideo');if(!v.videoWidth){msg('Камера ещё не готова.');return}
    const c=document.createElement('canvas');c.width=v.videoWidth;c.height=v.videoHeight;c.getContext('2d').drawImage(v,0,0);
    beep(true);close(c);
  }
  function shoot(){
    if(ticking)return;let n=+$('camTimer').value;
    if(!n){capture();return}
    const say=window.App&&App.say;
    $('camCount').textContent=n;beep(false);if(say)say(String(n));
    ticking=setInterval(()=>{n--;if(n<=0){clearInterval(ticking);ticking=null;$('camCount').textContent='';capture();return}
      $('camCount').textContent=n;beep(false);if(say&&n<=3)say(String(n))},1000);
  }
  function open({facing:f='environment',guide='body',title='Камера',timer=10}={}){
    if(!supported())return Promise.resolve(undefined);
    facing=f;lastFocus=document.activeElement;
    $('camTitle').textContent=title;$('camGuide').className='guide '+guide;$('camTimer').value=String(timer);
    $('camHint').textContent=guide==='body'
      ?'Поставьте телефон на уровне пояса, отойдите на 2–3 м. Макушка у верхней линии, стопы у нижней. Нажмите «Снять», таймер даст время встать.'
      :'Лицо в овале, смотрите прямо в камеру, ровный свет спереди.';
    $('cam').hidden=false;$('camShot').focus();start();
    return new Promise(r=>done=r);
  }
  function init(){
    $('camClose').onclick=()=>close(null);
    $('camShot').onclick=shoot;
    $('camFlip').onclick=()=>{facing=facing==='user'?'environment':'user';start()};
    $('cam').addEventListener('keydown',e=>{if(e.key==='Escape')close(null)});
    document.addEventListener('visibilitychange',()=>{if(document.hidden&&!$('cam').hidden)close(null)});
  }
  return {open,init,supported};
})();
