import * as THREE from './vendor/three.module.js';
// Lightweight spring strands on the original garment bones; world-space gravity
// keeps sleeves hanging while the animated shoulder and wrist supply inertia.
export class ClothMotion {
 constructor(model){
  this.model=model;this.chains=[];this.names=new Set();this.time=0;this.boneMap=new Map();
  const bones=[];model.traverse(o=>{if(o.isBone)bones.push(o);});
  for(const b of bones)this.boneMap.set(b.name,b);
  const fabric=b=>/^(袖_|前摆_|后摆_|带1_|带2_)/.test(b.name);
  for(const b of bones){if(fabric(b)){if(!b.userData.clothBind)b.userData.clothBind={q:b.quaternion.clone(),p:b.position.clone(),s:b.scale.clone()};const bind=b.userData.clothBind;b.quaternion.copy(bind.q);b.position.copy(bind.p);b.scale.copy(bind.s);}}
  const roots=bones.filter(b=>fabric(b)&&!fabric(b.parent));
  model.updateMatrixWorld(true);
  const pelvis=this.boneMap.get('下半身');if(pelvis&&!pelvis.userData.bodyBind)pelvis.userData.bodyBind=pelvis.getWorldQuaternion(new THREE.Quaternion());
  for(const root of roots){const list=[];let b=root;while(b&&fabric(b)){list.push(b);b=b.children.find(c=>c.isBone&&fabric(c));}
   if(list.length<3)continue;
   // Last MMD bone is a reverse-facing end marker, not a garment segment.
   const segments=list.slice(0,-1);const points=list.map(b=>b.getWorldPosition(new THREE.Vector3()));
   const lengths=points.slice(1).map((p,i)=>p.distanceTo(points[i]));
   const bind=segments.map(b=>({q:b.quaternion.clone(),p:b.position.clone(),s:b.scale.clone()}));
   const chain={bones:segments,all:list,bind,points,previous:points.map(p=>p.clone()),lengths,sleeve:root.name.startsWith('袖_'),phase:this.chains.length*.72,panel:root.name.startsWith("前摆_")?1:root.name.startsWith("后摆_")?-1:0};
   this.chains.push(chain);for(const bone of list)this.names.add(bone.name);
  }
  this.installSurfaceCollision();
 }
 bodyCapsules(){
  const result=[];const get=n=>this.boneMap.get(n)||this.boneMap.get(n.replaceAll('.',''));
  const segment=(a,b,r,part)=>{a=get(a);b=get(b);if(a&&b)result.push({a:a.getWorldPosition(new THREE.Vector3()),b:b.getWorldPosition(new THREE.Vector3()),radius:r,part});};
  for(const side of ['L','R']){
   segment('足.'+side,'ひざ.'+side,.175,'leg');
   segment('ひざ.'+side,'足首.'+side,.125,'leg');
  }
  for(const side of ['L','R']){segment('腕.'+side,'ひじ.'+side,.065,'arm');}
  segment('下半身','上半身2',.17,'torso');
  segment('上半身2','首',.19,'torso');
  return result;
 }
 collide(point,chain,capsules,forward){
  for(const cap of capsules){
   const ab=cap.b.clone().sub(cap.a),length=ab.lengthSq();
   const t=length?THREE.MathUtils.clamp(point.clone().sub(cap.a).dot(ab)/length,0,1):0;
   const center=cap.a.clone().addScaledVector(ab,t);
   const difference=point.clone().sub(center),radius=cap.radius+.025,distance=difference.length();
   if(chain.panel&&cap.part==='leg'){
    const n=forward.clone().multiplyScalar(chain.panel);
    const depth=difference.dot(n);
    const lateralSq=Math.max(0,difference.lengthSq()-depth*depth);
    if(lateralSq<radius*radius){const target=Math.sqrt(radius*radius-lateralSq)+.014;if(depth<target)point.addScaledVector(n,target-depth);}
    continue;
   }
   if(distance>=radius)continue;
   if(distance<1e-6)difference.copy(forward);else difference.divideScalar(distance);
   point.copy(center).addScaledVector(difference,radius+.002);
  }
 }
 installSurfaceCollision(){
  this.surface=[];
  this.model.traverse(mesh=>{
   if(!mesh.isSkinnedMesh)return;
   const index=mesh.geometry.getAttribute('skinIndex'),weight=mesh.geometry.getAttribute('skinWeight');
   if(!index||!weight)return;
   const mask=new Float32Array(index.count),side=new Float32Array(index.count);
   for(let v=0;v<index.count;v++)for(let k=0;k<4;k++){
    const bone=mesh.skeleton.bones[index.getComponent(v,k)];
    if(bone&&this.names.has(bone.name)){const w=weight.getComponent(v,k);mask[v]+=w;if(bone.name.startsWith('前摆_'))side[v]+=w;else if(bone.name.startsWith('后摆_'))side[v]-=w;}
   }
   mesh.geometry.setAttribute('clothMask',new THREE.BufferAttribute(mask,1));mesh.geometry.setAttribute('clothSide',new THREE.BufferAttribute(side,1));
   const uniforms={clothA:{value:Array.from({length:8},()=>new THREE.Vector3())},clothB:{value:Array.from({length:8},()=>new THREE.Vector3())},clothR:{value:Array(8).fill(0)},clothForward:{value:new THREE.Vector3(0,0,1)}};
   const materials=Array.isArray(mesh.material)?mesh.material:[mesh.material];
   for(const material of materials){material.onBeforeCompile=shader=>{
    Object.assign(shader.uniforms,uniforms);
    shader.vertexShader='attribute float clothMask;attribute float clothSide;uniform vec3 clothA[8];uniform vec3 clothB[8];uniform float clothR[8];uniform vec3 clothForward;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <skinning_vertex>',
     '#include <skinning_vertex>\n'+
     'if(clothMask>.15){for(int pass=0;pass<2;pass++){for(int c=0;c<8;c++){vec3 ab=clothB[c]-clothA[c];float t=clamp(dot(transformed-clothA[c],ab)/max(dot(ab,ab),.00001),0.,1.);vec3 center=clothA[c]+t*ab;vec3 d=transformed-center;float r=clothR[c];float distance=length(d);if(abs(clothSide)>.15&&c<4){vec3 n=clothForward*sign(clothSide);float depth=dot(d,n);float lateral=max(0.,dot(d,d)-depth*depth);if(lateral<r*r){float target=sqrt(max(0.,r*r-lateral))+.018;if(depth<target)transformed+=n*(target-depth);}}else if(distance<r){vec3 n=distance>.00001?d/distance:clothForward;transformed=center+n*(r+.001);}}}}');
   };material.customProgramCacheKey=()=> 'cloth-surface-collision-v2';material.needsUpdate=true;}
   this.surface.push({mesh,uniforms});
  });
 }
 updateSurface(capsules,forward){
  for(const {mesh,uniforms} of this.surface){mesh.updateWorldMatrix(true,false);const inverse=mesh.matrixWorld.clone().invert();const scale=mesh.getWorldScale(new THREE.Vector3()).x;
   for(let i=0;i<8;i++){const c=capsules[i];if(c){uniforms.clothA.value[i].copy(c.a).applyMatrix4(inverse);uniforms.clothB.value[i].copy(c.b).applyMatrix4(inverse);uniforms.clothR.value[i]=(c.radius+.012)/scale;}else uniforms.clothR.value[i]=0;}
   uniforms.clothForward.value.copy(forward).transformDirection(inverse);
  }
 }
 filterClip(clip){return new THREE.AnimationClip(clip.name,clip.duration,clip.tracks.filter(track=>!this.names.has(track.name.slice(0,track.name.lastIndexOf('.')))).map(t=>t.clone()));}
 resetPose(){for(const c of this.chains)for(let i=0;i<c.bones.length;i++){const b=c.bones[i],bind=c.bind[i];b.quaternion.copy(bind.q);b.position.copy(bind.p);b.scale.copy(bind.s);}this.model.updateMatrixWorld(true);}
 settle(){this.resetPose();for(const c of this.chains){c.points=c.all.map(b=>b.getWorldPosition(new THREE.Vector3()));c.previous=c.points.map(p=>p.clone());}for(let i=0;i<100;i++)this.step(1/60,true);}
 update(dt){const count=Math.max(1,Math.ceil(dt/(1/90)));for(let i=0;i<count;i++)this.step(Math.min(dt/count,1/60),false);}
 step(dt,settling){this.time+=settling?0:dt;this.resetPose();
  const colliders=this.bodyCapsules();
  const pelvis=this.boneMap.get('下半身');
  const forward=new THREE.Vector3(0,0,1);
  if(pelvis){const inverseBind=this.boneMap.get('下半身').userData.bodyBind;
   const q=pelvis.getWorldQuaternion(new THREE.Quaternion());
   if(inverseBind)q.multiply(inverseBind.clone().invert());forward.applyQuaternion(q).normalize();}
  for(const c of this.chains){const anchor=c.bones[0].getWorldPosition(new THREE.Vector3());const reference=c.all.map(b=>b.getWorldPosition(new THREE.Vector3()));
   c.points[0].copy(anchor);c.previous[0].copy(anchor);
   for(let i=1;i<c.points.length;i++){const p=c.points[i],old=p.clone();const velocity=p.clone().sub(c.previous[i]).multiplyScalar(settling?.75:Math.pow(.96,dt*60));if(velocity.length()>.045)velocity.setLength(.045);p.add(velocity);c.previous[i].copy(old);
    p.y-=3.8*dt*dt;
    const wind=settling?0:Math.sin(this.time*1.6+c.phase)*.09+Math.sin(this.time*2.7)*.025;
    p.x+=wind*dt*dt;p.z+=Math.cos(this.time*1.1+c.phase)*.035*dt*dt;
    // Garment shape memory is deliberately light at the free hem.
    const strength=c.sleeve?.12:.7;
    p.addScaledVector(reference[i].clone().sub(p),strength*dt*dt);
   }
   for(let pass=0;pass<9;pass++){
    c.points[0].copy(anchor);
    for(let i=0;i<c.lengths.length;i++){const a=c.points[i],b=c.points[i+1],delta=b.clone().sub(a);const length=delta.length();if(length<1e-7)continue;const fix=delta.multiplyScalar((length-c.lengths[i])/length);if(i===0)b.sub(fix);else{a.addScaledVector(fix,.5);b.addScaledVector(fix,-.5);}}
    for(let i=1;i<c.points.length;i++){const p=c.points[i];const minimum=.035;if(p.y<minimum)p.y=minimum;
     this.collide(p,c,colliders,forward);
    }
   }
   // Collisions run last as well, so length constraints cannot pull cloth back inside.
   for(let i=1;i<c.points.length;i++)this.collide(c.points[i],c,colliders,forward);
   for(let i=0;i<c.bones.length;i++){
    const bone=c.bones[i];bone.updateWorldMatrix(true,false);
    const original=bone.getWorldQuaternion(new THREE.Quaternion());const direction=c.points[i+1].clone().sub(c.points[i]).normalize();
    const axis=new THREE.Vector3(0,1,0).applyQuaternion(original).normalize();const delta=new THREE.Quaternion().setFromUnitVectors(axis,direction);
    const world=delta.multiply(original);const parent=bone.parent.getWorldQuaternion(new THREE.Quaternion()).invert();bone.quaternion.copy(parent.multiply(world));bone.updateWorldMatrix(false,true);
   }
  }
  this.model.updateMatrixWorld(true);this.updateSurface(colliders,forward);
 }
}
