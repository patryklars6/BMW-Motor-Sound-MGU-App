'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {languageOf,resolveLanguage,translate,localizeCanvas}=require('../apps/patryklars6_motor_sound/i18n');
test('automatic language decodes BMW enums and locale names; manual choice wins',()=>{
 for(const [value,want] of [[1,'de'],[2,'en'],[3,'en'],[20,'tr'],['DEUTSCH','de'],['ENGLISCH__UK','en'],['ENGLISCH__US','en'],['TUERKISCH','tr'],['tr_TR','tr'],['en-US','en'],['de-DE','de']])assert.equal(languageOf(value),want);
 for(const value of [null,undefined,255,0,{},'SIGNAL_UNGUELTIG','fr_FR'])assert.equal(languageOf(value),null);
 assert.equal(resolveLanguage('auto','tr_TR'),'tr');assert.equal(resolveLanguage('auto',null),'en');assert.equal(resolveLanguage('auto','fr_FR'),'en');
 assert.equal(resolveLanguage('en','tr'),'en');assert.equal(resolveLanguage('tr','DEUTSCH'),'tr');assert.equal(resolveLanguage('de','en_US'),'de');
});
test('translation preserves numbers and identifiers, covers compound labels and dynamic status',()=>{
 assert.equal(translate('Hauptmenü','en'),'Main menu');assert.equal(translate('Hauptmenü','tr'),'Ana menü');assert.equal(translate('Hauptmenü','de'),'Hauptmenü');
 assert.equal(translate('Pegel 30 %  ·  Grenze 55 %','en'),'Level 30 %  ·  Limit 55 %');
 assert.equal(translate('Vorgabe · Vorn · Center bei 5 Kanälen','tr'),'Varsayılan · Ön · 5 kanalda merkez');
 for(const text of ['2400','30 %','BTN_CONFIG','v8','MATCH UP 10'])assert.equal(translate(text,'tr'),text);
});
test('canvas locale is per instance; reused frames never stack translators or alter target IDs',()=>{
 const a=[],b=[];const first={text(v){a.push(v);return this;},target(id){return id;}};const second={text(v){b.push(v);return this;}};
 assert.equal(localizeCanvas(first,'tr').text('Hauptmenü'),first);localizeCanvas(second,'en').text('Hauptmenü');
 localizeCanvas(first,'de').text('Hauptmenü');assert.deepEqual(a,['Ana menü','Hauptmenü']);assert.deepEqual(b,['Main menu']);assert.equal(first.target('settings-Lautsprecher'),'settings-Lautsprecher');
});
const {Telemetry}=require('../apps/patryklars6_motor_sound/telemetry');
const spec=require('../apps/patryklars6_motor_sound/app.json');
test('vehicle language is read-only, updates live and disappears on invalidation',()=>{
 let now=0;const telemetry=new Telemetry(()=>now),groups=telemetry.watchGroups();
 const field=groups['de.bmw.infotainment.vehicle.Vehicle'].statusNewCurrentUnitsStatusExt;
 field.decode({language:'TUERKISCH'},true);assert.equal(telemetry.snapshot().language,'tr');now=20000;assert.equal(telemetry.snapshot().language,'tr');
 field.decode({language:2},true);assert.equal(telemetry.snapshot().language,'en');field.decode(null);assert.equal(telemetry.snapshot().language,null);
 assert.equal(spec.signals['de.bmw.infotainment.vehicle.Vehicle'].statusNewCurrentUnitsStatusExt,'rs');
 const item=spec.settings.find(s=>s.key==='language');assert.equal(item.default,'auto');assert.deepEqual(item.options.map(p=>p[0]),['auto','tr','en','de']);
});
const catalog=require('../apps/patryklars6_motor_sound/translations');
test('all configurable UI labels have English and Turkish entries or are model names/numbers',()=>{
 const names=new Set(['BMW HiFi','BMW M Sound','BMW M5 F90','Bowers & Wilkins','COMFORT','ECO PRO','Harman Kardon','INDIVIDUAL','Ice White','LUXO','M Performance','M-Performance','MATCH UP 10','MATCH UP 8','Orange Sport','SPORT','SPORT PLUS','Turbo','Twin-Scroll','English','Türkçe','Deutsch']);
 const labels=[];for(const item of spec.settings){labels.push(item.label,item.group);for(const option of item.options||[])labels.push(option[1]);}
 for(const page of spec.screens){labels.push(page.title);for(const button of page.buttons||[])labels.push(button[1]);}
 for(const label of new Set(labels.filter(Boolean))){if(names.has(label)||/^-?\d+ %$/.test(label))continue;assert.ok(catalog[label],label+' needs translation');assert.equal(catalog[label].length,2);assert.ok(catalog[label].every(text=>typeof text==='string'&&text.length>0));}
});
