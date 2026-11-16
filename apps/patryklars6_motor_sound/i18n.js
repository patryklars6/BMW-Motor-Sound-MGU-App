'use strict';
const catalog=require('./translations');
const supported=['de','en','tr'];
const originalText=new WeakMap();
function languageOf(value){
    if(typeof value==='number')return ({1:'de',2:'en',3:'en',20:'tr'})[value] || null;
    if(typeof value!=='string')return null;
    const named={DEUTSCH:'de',ENGLISCH__UK:'en',ENGLISCH__US:'en',TUERKISCH:'tr'};
    if(Object.prototype.hasOwnProperty.call(named,value))return named[value];
    const base=value.toLowerCase().split(/[-_]/)[0];
    return supported.indexOf(base)!==-1?base:null;
}
function resolveLanguage(choice,vehicle){
    return supported.indexOf(choice)!==-1?choice:languageOf(vehicle) || 'en';
}
function translate(value,language){
    if(typeof value!=='string' || language==='de')return value;
    const column=language==='tr'?1:0;
    if(Object.prototype.hasOwnProperty.call(catalog,value))return catalog[value][column];
    const level=/^Pegel (.+)  ·  Grenze (.+)$/.exec(value);
    if(level)return translate('Pegel',language)+' '+level[1]+'  ·  '+translate('Grenze',language)+' '+level[2];
    const version=/^iDrive 7  ·  Version (.+)$/.exec(value);
    if(version)return 'iDrive 7  ·  '+translate('Version',language)+' '+version[1];
    if(value.indexOf(' · ')!==-1)return value.split(' · ').map(part=>translate(part,language)).join(' · ');
    return value;
}
function localizeCanvas(canvas,language){
    // The kit reuses recorders; never wrap the previous frame's translator.
    if(!originalText.has(canvas))originalText.set(canvas,canvas.text);
    const text=originalText.get(canvas);
    canvas.text=function(value){
        const args=Array.prototype.slice.call(arguments);args[0]=translate(value,language);
        return text.apply(this,args);
    };
    return canvas;
}
module.exports={languageOf,resolveLanguage,translate,localizeCanvas};
