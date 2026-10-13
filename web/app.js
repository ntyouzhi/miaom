import * as THREE from './vendor/three.module.js';
import {OrbitControls} from './vendor/OrbitControls.js';
import {GLTFLoader} from './vendor/GLTFLoader.js';
import {ClothMotion} from './cloth.js';
const $=s=>document.querySelector(s),canvas=$('#canvas'),stage=$('#stage');
const music=$('#dance-music'),musicButton=$('#music-toggle');let musicEnabled=true;
music.volume=.65;music.preservesPitch=true;
function musicLabel(){musicButton.textContent=musicEnabled?'♪ 音乐开':'♪ 音乐关';musicButton.setAttribute('aria-pressed',musicEnabled);musicButton.setAttribute('aria-label',musicEnabled?'关闭舞蹈音乐':'开启舞蹈音乐');}
function syncMusic(){musicButton.hidden=mode!=='dance';musicLabel();music.playbackRate=Number($('#speed').value);if(action&&Number.isFinite(music.duration))music.currentTime=Math.min(action.time,music.duration-.001);if(mode==='dance'&&playing&&musicEnabled){music.play().then(()=>{if(mode!=='dance'||!playing||!musicEnabled)music.pause();}).catch(()=>{musicEnabled=false;musicLabel();});}else music.pause();}
music.addEventListener('loadedmetadata',()=>{if(action)syncMusic();});
musicButton.onclick=()=>{musicEnabled=!musicEnabled;syncMusic();};
let renderer;
try{renderer=new THREE.WebGLRenderer({canvas,alpha:true,antialias:true,preserveDrawingBuffer:false});}catch(e){$('#loading b').textContent='浏览器未启用三维图形';$('#progress').textContent='请使用支持 WebGL 的浏览器，并开启硬件加速。';throw e;}
const phoneLayout=matchMedia('(max-width:700px), (max-width:950px) and (pointer:coarse)');
renderer.setPixelRatio(Math.min(devicePixelRatio,phoneLayout.matches?1.25:2));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.setClearColor(0x000000,0);
const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(32,1,.01,2000),controls=new OrbitControls(camera,canvas);
controls.enableDamping=true;controls.autoRotateSpeed=.65;controls.enablePan=false;
const root=new THREE.Group();scene.add(root);
scene.add(new THREE.HemisphereLight(0xf2fff8,0x263b40,2.1));
const key=new THREE.DirectionalLight(0xfff5e8,2.2);key.position.set(-3,5,4);scene.add(key);
const rim=new THREE.DirectionalLight(0x8ad6ce,1.6);rim.position.set(3,2,-3);scene.add(rim);
const fill=new THREE.DirectionalLight(0xd8e7ff,.7);fill.position.set(3,2,4);scene.add(fill);
const floor=new THREE.Mesh(new THREE.CircleGeometry(1.15,100),new THREE.MeshBasicMaterial({color:0x665083,transparent:true,opacity:.12,side:THREE.DoubleSide}));floor.rotation.x=-Math.PI/2;floor.position.y=-.012;scene.add(floor);
const ring=new THREE.Mesh(new THREE.RingGeometry(1.13,1.14,100),new THREE.MeshBasicMaterial({color:0xb298d8,transparent:true,opacity:.3,side:THREE.DoubleSide}));ring.rotation.x=-Math.PI/2;ring.position.y=-.008;scene.add(ring);
const loader=new GLTFLoader(),cache=new Map();let cloth,model,mixer,action,mode='static',playing=true,request=0,extent=2;
const timeFormat=s=>`${Math.floor(s/60).toString().padStart(2,'0')}:${Math.floor(s%60).toString().padStart(2,'0')}`;
function reset(){const mask=mode==='mask',mobile=phoneLayout.matches;const aspect=stage.clientWidth/Math.max(1,stage.clientHeight);const distance=mobile?Math.max(mask?3.6:4.35,(mask?.95:.82)/(Math.tan(THREE.MathUtils.degToRad(16))*aspect)):mask?3.6:4.9;camera.position.set(0,mask?.08:1.05,distance);controls.target.set(0,mask?0:1,0);controls.minDistance=mask?1:1.2;controls.maxDistance=mobile?Math.max(10,distance*1.5):mask?7:10;controls.update();}
const playback=$('#playbar'),options=$('.display-options');
function arrangeControls(){options.open=!phoneLayout.matches;renderer.setPixelRatio(Math.min(devicePixelRatio,phoneLayout.matches?1.5:2));reset();}
phoneLayout.addEventListener('change',arrangeControls);arrangeControls();
async function load(next){const token=++request;music.pause();$('#play').disabled=$('#mask').disabled=true;$('#loading').hidden=false;$('#loading b').textContent='正在唤醒展台';$('#progress').textContent='载入模型与贴图…';
try{let gltf=cache.get(next);if(!gltf){gltf=await loader.loadAsync(new URL('./assets/'+next+'.glb',import.meta.url).href,e=>{if(token===request&&e.total)$('#progress').textContent=`载入中 ${Math.round(e.loaded/e.total*100)}%`;});cache.set(next,gltf);}if(token!==request)return;
if(mixer)mixer.stopAllAction();root.clear();model=gltf.scene;model.position.set(0,0,0);model.scale.setScalar(1);model.rotation.set(0,0,0);
model.traverse(o=>{if(o.isMesh&&!o.userData.ready){const convert=m=>{const options={map:m.map,color:m.color,side:THREE.DoubleSide,transparent:m.opacity<.99,opacity:m.opacity,alphaTest:.45};const fabric=/服|前摆|带|配饰/.test(m.name);return fabric?new THREE.MeshPhysicalMaterial({...options,roughness:.64,metalness:0,sheen:.85,sheenColor:new THREE.Color(0xc6dcd7),sheenRoughness:.5,emissive:0xffffff,emissiveMap:m.map,emissiveIntensity:.08}):new THREE.MeshBasicMaterial(options);};o.material=Array.isArray(o.material)?o.material.map(convert):convert(o.material);o.frustumCulled=false;o.userData.ready=true;}});
const box=new THREE.Box3().setFromObject(model),size=box.getSize(new THREE.Vector3()),center=box.getCenter(new THREE.Vector3());const scale=(next==='mask'?1.7:2)/Math.max(size.x,size.y,size.z);model.scale.setScalar(scale);model.position.set(-center.x*scale,(next==='mask'?-center.y:-box.min.y)*scale,-center.z*scale);root.add(model);mode=next;document.body.dataset.mode=next;
cloth=next==='mask'?null:new ClothMotion(model);
mixer=null;action=null;if(next==='dance'&&gltf.animations.length){mixer=new THREE.AnimationMixer(model);action=mixer.clipAction(cloth.filterClip(gltf.animations[0]));action.play();mixer.timeScale=Number($('#speed').value);playing=true;$('#play').textContent='暂停';$('#duration').textContent=timeFormat(action.getClip().duration);$('#seek').max=action.getClip().duration;$('#seek').value=0;}
if(cloth)cloth.settle();
$('#timeline').hidden=!action;floor.visible=ring.visible=next!=='mask';reset();$('#view-label').textContent={static:'角色展示',dance:'舞蹈动作',mask:'面具特写'}[next];document.querySelectorAll('.mode').forEach(b=>{b.classList.toggle('active',b.dataset.mode===next);b.setAttribute('aria-pressed',b.dataset.mode===next);});syncPlayback();$('#play').disabled=$('#mask').disabled=false;$('#loading').hidden=true;
}catch(e){if(token!==request)return;$('#loading b').textContent='模型未能载入';$('#progress').textContent='网络加载失败，请检查连接后重试。';$('#play').disabled=$('#mask').disabled=false;console.error(e);}}
$('#reset').onclick=reset;
$('#rotate').onclick=()=>{controls.autoRotate=!controls.autoRotate;$('#rotate').setAttribute('aria-pressed',controls.autoRotate);};
document.querySelectorAll('[data-bg]').forEach(b=>b.onclick=()=>{document.body.dataset.theme=b.dataset.bg;document.querySelectorAll('[data-bg]').forEach(x=>{x.classList.toggle('selected',x===b);x.setAttribute('aria-pressed',x===b);});});
function syncPlayback(){syncMusic();const dancing=mode==='dance';$('#play').textContent=dancing&&playing?'Ⅱ 暂停':'▶ 播放';$('#play').setAttribute('aria-label',dancing&&playing?'暂停舞蹈':'播放舞蹈');$('#mask').textContent=mode==='mask'?'返回角色':'面具特写';$('#mask').setAttribute('aria-label',mode==='mask'?'返回角色展示':'面具特写');$('#mask').setAttribute('aria-pressed',mode==='mask');}
$('#play').onclick=()=>{if(mode!=='dance'){load('dance');return;}playing=!playing;syncPlayback();};
$('#mask').onclick=()=>load(mode==='mask'?'static':'mask');
$('#speed').onchange=()=>{if(mixer)mixer.timeScale=Number($('#speed').value);syncMusic();};$('#seek').oninput=()=>{if(action){action.time=Number($('#seek').value);mixer.update(0);if(cloth)cloth.settle();syncMusic();}};
$('#fullscreen').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch(e){$('#fullscreen').textContent='当前浏览器不支持全屏';}};document.addEventListener('fullscreenchange',()=>$('#fullscreen').textContent=document.fullscreenElement?'退出全屏 ↙':'全屏观赏 ↗');
$('#capture').onclick=()=>{renderer.render(scene,camera);const c=document.createElement('canvas');c.width=canvas.width;c.height=canvas.height;const ctx=c.getContext('2d');ctx.fillStyle=getComputedStyle(document.body).backgroundColor;ctx.fillRect(0,0,c.width,c.height);ctx.drawImage(canvas,0,0);ctx.fillStyle=getComputedStyle(document.body).color;ctx.font=`${Math.max(14,c.width/45)}px Microsoft YaHei`;ctx.fillText('魈 · XIAO',24,40);ctx.font=`${Math.max(10,c.width/75)}px Microsoft YaHei`;ctx.fillText('模型：miHoYo / 观海 · 私人观赏',24,c.height-24);const a=document.createElement('a');a.download=`魈-${mode}-${Date.now()}.png`;a.href=c.toDataURL('image/png');a.click();};
let lastStageWidth=0;new ResizeObserver(()=>{const w=stage.clientWidth,h=stage.clientHeight;if(!w||!h)return;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();if(phoneLayout.matches&&lastStageWidth&&Math.abs(w-lastStageWidth)>1)reset();lastStageWidth=w;}).observe(stage);
const clock=new THREE.Clock();let frameTime=0;function animate(){requestAnimationFrame(animate);frameTime+=Math.min(clock.getDelta(),.1);if(phoneLayout.matches&&frameTime<1/30)return;const dt=Math.min(frameTime,.1);frameTime=0;if(document.hidden)return;if(mixer&&playing){if(!music.paused&&musicEnabled){action.time=Math.min(music.currentTime,action.getClip().duration);mixer.update(0);}else mixer.update(dt);}if(cloth&&action&&playing)cloth.update(dt);if(action){$('#seek').value=action.time;$('#time').textContent=timeFormat(action.time);}controls.update();renderer.render(scene,camera);}animate();load('static');
