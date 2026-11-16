'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../apps/patryklars6_motor_sound');
const spec=require(root+'/app.json'),{resolveSettings}=require(root+'/sound');
async function setup(){
 let impl;const clicks={},loops={},labels={},values={},texts=[],targets=new Map(),changes=[];let changed;
 spec.settings.forEach(item=>values[item.key]=item.default);
 const data={language:'tr',mode:'comfort',rpm:720,engine:'running',speed:0,acceleration:0,stage:'P',gear:null,idle:true,pedal:null,torque:null};
 const canvas={own:true,extra:0,text(value){texts.push(value);return this;},target(x,y,w,h,fn,key){targets.set(key,fn);}};
 for(const name of ['fillRect','roundRect','strokeRoundRect','polyline','line','arc','circle'])canvas[name]=()=>canvas;
 const settings={schema:spec.settings,get:key=>values[key],item:key=>spec.settings.find(s=>s.key===key),shown:()=>true,display:key=>{
  const item=spec.settings.find(s=>s.key===key);if(item.type==='choice')return item.options.find(p=>p[0]===values[key])[1];return String(values[key]);
 },set(key,value){values[key]=value;changes.push(key);if(changed)changed(key);},onChange(fn){changed=fn;}};
 const ctx={spec,settings,background:{vehicle:{snapshot:()=>data},output:{channels:0,state:'waiting'},effective:mode=>resolveSettings(k=>values[k],mode)},
  ui:{onClick:(key,fn)=>clicks[key]=fn,text:(key,value)=>{labels[key]=value;return Promise.resolve();},onVisible(){},image:()=>Promise.resolve(),open:()=>Promise.resolve(),close:()=>Promise.resolve()},
  loop:(name,fps,fn)=>{loops[name]=fn;return {kick(){}};},onTap(){},hideButton(){},onLayout(){},canvas:()=>canvas};
 const sandbox={console,process:{uptime:()=>1},require(name){if(name==='./kit/mgu')return {run(value){impl=value;return Promise.resolve();}};if(name==='./kit/themes')return {THEMES:{},theme:()=>({})};return require(name.startsWith('.')?path.resolve(root,name):name);}};
 vm.runInNewContext(fs.readFileSync(root+'/main.js','utf8'),sandbox);impl.start(ctx);
 return {ctx,values,data,texts,targets,labels,changes,async render(name){texts.length=0;await loops[name]();}};
}
test('app language follows vehicle, manual override and native labels without changing sound or navigation',async()=>{
 const p=await setup();await p.render('MAIN');assert.ok(p.texts.includes('Ana menü'));assert.equal(p.labels.BTN_TUNE_HOME,'Ana menü');
 p.data.language='en';await p.render('MAIN');assert.ok(p.texts.includes('Main menu'));
 p.ctx.settings.set('language','tr');p.data.language='de';await p.render('MAIN');assert.ok(p.texts.includes('Ana menü'));assert.equal(p.values.enabled,false);
 await p.render('CONFIG');assert.ok(p.texts.includes('Ayarlar'));assert.ok(p.targets.has('settings-Lautsprecher'));
 p.ctx.settings.set('language','auto');await p.render('MAIN');assert.ok(p.texts.includes('Hauptmenü'));assert.equal(p.labels.BTN_TUNE_HOME,'Hauptmenü');
 assert.ok(p.changes.every(key=>key==='language'));assert.equal(p.values.enabled,false);
});
