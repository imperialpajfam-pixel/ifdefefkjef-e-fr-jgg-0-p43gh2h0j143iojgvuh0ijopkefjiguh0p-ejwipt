const http=require('http'),fs=require('fs'),path=require('path'),crypto=require('crypto');
let DIR=process.env.DATA_DIR||path.join(__dirname,'data');
try{fs.mkdirSync(DIR,{recursive:true});fs.accessSync(DIR,fs.constants.W_OK)}catch(e){console.error('DATA_DIR no disponible, usando ./data:',e.message);DIR=path.join(__dirname,'data');fs.mkdirSync(DIR,{recursive:true})}
const FILE=path.join(DIR,'db.json');
process.on('uncaughtException',e=>console.error(e));
let DB={groups:{}};try{DB=JSON.parse(fs.readFileSync(FILE,'utf8'))}catch(e){}
let pool=null,timer=null;
if(process.env.DATABASE_URL){const U=process.env.DATABASE_URL;try{pool=new(require('pg').Pool)({connectionString:U,connectionTimeoutMillis:10000,idleTimeoutMillis:30000,ssl:/railway\.internal/.test(U)?false:{rejectUnauthorized:false}});pool.on('error',e=>console.error('pg:',e.message))}catch(e){console.error('No se pudo cargar la librería pg ('+e.message+'). Se usa archivo.');pool=null}}
const writeDB=async()=>{if(pool)await pool.query('insert into arc_state(id,data) values(1,$1) on conflict(id) do update set data=$1',[JSON.stringify(DB)]);else{const t=FILE+'.tmp';fs.writeFileSync(t,JSON.stringify(DB));fs.renameSync(t,FILE)}};
const save=()=>{clearTimeout(timer);timer=setTimeout(()=>{timer=null;writeDB().catch(e=>console.error('Error guardando:',e.message))},pool?250:0)};
const flush=async()=>{if(timer){clearTimeout(timer);timer=null;try{await writeDB()}catch(e){console.error(e)}}};
process.on('SIGTERM',async()=>{await flush();process.exit(0)});
const H=(p,s)=>crypto.createHash('sha256').update(s+':'+p).digest('hex');
const cl=(s,n=24)=>String(s||'').trim().slice(0,n),key=u=>cl(u,20).toLowerCase();
const num=(v,max)=>Math.max(0,Math.min(max,Math.round(+v||0)));
const FAIL={};setInterval(()=>{for(const k in FAIL)delete FAIL[k]},6e5);
class E extends Error{constructor(m,c=400){super(m);this.c=c}}
const board=g=>Object.values(g.m).map(m=>({u:m.n,st:m.st||0,wk:m.wk||0,mo:m.mo||0,hb:m.hb||0,ph:m.ph||'',t:m.t||0,ach:m.ach||[],ch:(m.ch||[]).filter(x=>Date.now()-x.t<864e5).map(x=>x.f),cd:m.cd||0,own:m.k==g.owner}));
const out=(g,x)=>({name:g.name,board:board(g),chal:g.chal||null,...x});
const ac=()=>DB.accts||(DB.accts={});
const grp=b=>{const g=DB.groups[cl(b.code,6).toUpperCase()];if(!g)throw new E('Grupo no encontrado',404);return g};
const mem=(g,b)=>{const m=g.m[key(b.user)];if(!m||m.tok!==b.token)throw new E('Sesión inválida',401);return m};
const okPin=p=>/^\d{4,8}$/.test(p);
const A={
create(b){const user=cl(b.user,20),pin=cl(b.pin,8),name=cl(b.group);if(!user||!name||!okPin(pin))throw new E('Faltan datos o el PIN no es válido.');
 let code;do{code=Array.from(crypto.randomBytes(6),x=>'ABCDEFGHJKMNPQRSTUVWXYZ23456789'[x%31]).join('')}while(DB.groups[code]);
 const k=key(user),tok=crypto.randomBytes(16).toString('hex');
 const g=DB.groups[code]={name,owner:k,m:{[k]:{k,n:user,pin:H(pin,code),tok}}};save();return out(g,{code,token:tok})},
join(b){const g=grp(b),code=cl(b.code,6).toUpperCase(),user=cl(b.user,20),pin=cl(b.pin,8),k=key(user);
 if(!user||!okPin(pin))throw new E('Faltan datos o el PIN no es válido.');
 const fk=code+k;if((FAIL[fk]||0)>8)throw new E('Demasiados intentos. Espera unos minutos.',429);
 let m=g.m[k];
 if(m){if(m.pin!==H(pin,code)){FAIL[fk]=(FAIL[fk]||0)+1;throw new E('Ese nombre ya existe en el grupo y el PIN no coincide.',401)}FAIL[fk]=0}
 else{if(Object.keys(g.m).length>=20)throw new E('El grupo está lleno.');m=g.m[k]={k,n:user,pin:H(pin,code),tok:crypto.randomBytes(16).toString('hex')};save()}
 return out(g,{code,token:m.tok})},
sync(b){const g=grp(b),m=mem(g,b),s=b.stats||{};m.st=num(s.st,9999);m.wk=num(s.wk,100);m.mo=num(s.mo,100);m.hb=num(s.hb,99);m.cd=num(s.cd,100);if(Array.isArray(s.ach))m.ach=s.ach.slice(0,30).map(x=>cl(x,24));if(typeof s.ph=='string'&&s.ph.length<6000&&/^data:image\/jpeg;base64,[A-Za-z0-9+\/=]+$/.test(s.ph))m.ph=s.ph;else if(!s.ph)delete m.ph;m.t=Date.now();save();return out(g)},
kick(b){const g=grp(b),m=mem(g,b),t=key(b.target);if(g.owner!==m.k)throw new E('Solo el dueño puede sacar miembros.',403);if(t===g.owner)throw new E('No puedes sacarte a ti mismo.');delete g.m[t];save();return out(g)},
leave(b){const g=grp(b),m=mem(g,b);if(g.owner===m.k)throw new E('El administrador no puede salirse del grupo. Puedes eliminarlo.',403);delete g.m[m.k];save();return{ok:true}},
cheer(b){const g=grp(b),m=mem(g,b),t=g.m[key(b.target)];if(!t)throw new E('Miembro no encontrado.',404);if(t===m)throw new E('No puedes animarte a ti mismo 😅');const now=Date.now();t.ch=(t.ch||[]).filter(x=>now-x.t<864e5);if(t.ch.some(x=>x.f===m.n))throw new E('Ya le mandaste ánimo hoy.');t.ch.push({f:m.n,t:now});save();return out(g)},
chal(b){const g=grp(b),m=mem(g,b);if(g.owner!==m.k)throw new E('Solo el dueño puede manejar el reto.',403);const d=num(b.days,365);if(!d)delete g.chal;else{const st=cl(b.start,10);if(!/^\d{4}-\d\d-\d\d$/.test(st))throw new E('Fecha inválida.');g.chal={n:cl(b.name)||'Reto',s:st,d}}save();return out(g)},
bk_save(b){const u=key(b.user),pin=cl(b.pin,8);if(!u||!okPin(pin))throw new E('Nombre o PIN no válido.');const fk='bk'+u;if((FAIL[fk]||0)>8)throw new E('Demasiados intentos. Espera unos minutos.',429);
 const a=ac()[u];if(a&&a.pin!==H(pin,'bk')){FAIL[fk]=(FAIL[fk]||0)+1;throw new E('Ese nombre ya tiene un respaldo con otro PIN.',401)}
 if(typeof b.data!=='string'||b.data.length>25e4)throw new E('Los datos son muy grandes.');ac()[u]={pin:H(pin,'bk'),data:b.data,t:Date.now()};FAIL[fk]=0;save();return{ok:true}},
bk_load(b){const u=key(b.user),pin=cl(b.pin,8),a=ac()[u];const fk='bk'+u;if((FAIL[fk]||0)>8)throw new E('Demasiados intentos. Espera unos minutos.',429);if(!a)throw new E('No hay respaldo con ese nombre.',404);if(a.pin!==H(pin,'bk')){FAIL[fk]=(FAIL[fk]||0)+1;throw new E('PIN incorrecto.',401)}FAIL[fk]=0;return{data:a.data,t:a.t}},
bk_delete(b){const u=key(b.user),pin=cl(b.pin,8),a=ac()[u];if(!a)return{ok:true};const fk='bk'+u;if((FAIL[fk]||0)>8)throw new E('Demasiados intentos. Espera unos minutos.',429);if(a.pin!==H(pin,'bk')){FAIL[fk]=(FAIL[fk]||0)+1;throw new E('PIN incorrecto.',401)}delete ac()[u];FAIL[fk]=0;save();return{ok:true}},
destroy(b){const g=grp(b),m=mem(g,b);if(g.owner!==m.k)throw new E('Solo el dueño puede eliminar el grupo.',403);delete DB.groups[cl(b.code,6).toUpperCase()];save();return{ok:true}}
};
const T={'.html':'text/html','.json':'application/json','.svg':'image/svg+xml','.js':'text/javascript','.png':'image/png'};
const srv=http.createServer((q,r)=>{
 if(q.url.startsWith('/api/ping')){r.writeHead(200,{'Content-Type':'application/json'});return r.end(JSON.stringify({ok:true,grupos:Object.keys(DB.groups).length,datos:pool?'postgres':'archivo (SIN base de datos) '+DIR}))}
 if(q.url.startsWith('/api/')){
  if(q.method!=='POST'){r.writeHead(405,{'Content-Type':'application/json'});return r.end('{"error":"Método no permitido"}')}
  let d='';const lim=q.url.includes('bk_')?4e5:15e3;q.on('data',c=>{d+=c;if(d.length>lim)q.destroy()});
  q.on('end',()=>{let o,c=200;try{const n=q.url.slice(5).split('?')[0];if(!Object.hasOwn(A,n))throw new E('No existe',404);o=A[n](JSON.parse(d||'{}'))}
   catch(e){const k=e instanceof E;c=k?e.c:400;o={error:k?e.message:'Solicitud inválida'};if(!k)console.error(e)}
   r.writeHead(c,{'Content-Type':'application/json'});r.end(JSON.stringify(o))});return}
 let p=q.url.split('?')[0];if(p==='/')p='/index.html';
 const f=path.join(__dirname,'public',path.normalize(p).replace(/^(\.\.[\/\\])+/,''));
 fs.readFile(f,(e,x)=>{if(e){r.writeHead(404);return r.end('No encontrado')}r.writeHead(200,{'Content-Type':T[path.extname(f)]||'text/plain'});r.end(x)});
});
(async()=>{if(pool){try{let hn='?';try{hn=new URL(process.env.DATABASE_URL).host}catch(e){}console.log('Conectando a Postgres en '+hn+'…');await pool.query('create table if not exists arc_state(id int primary key,data jsonb not null)');const r=await pool.query('select data from arc_state where id=1');if(r.rows[0])DB=r.rows[0].data;console.log('Base de datos conectada: '+Object.keys(DB.groups).length+' grupos')}catch(e){console.error('NO CONECTÓ A POSTGRES ('+(e.message||e.code||e)+'). Se usa archivo: los datos se borrarán al actualizar.');pool=null}}
srv.listen(process.env.PORT||3000,()=>console.log('ARC activo'))})();
