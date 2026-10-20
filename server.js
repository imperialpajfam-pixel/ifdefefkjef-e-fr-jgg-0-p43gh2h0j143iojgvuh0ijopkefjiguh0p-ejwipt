const http=require('http'),fs=require('fs'),path=require('path'),crypto=require('crypto');
let DIR=process.env.DATA_DIR||path.join(__dirname,'data');
try{fs.mkdirSync(DIR,{recursive:true});fs.accessSync(DIR,fs.constants.W_OK)}catch(e){console.error('DATA_DIR no disponible, usando ./data:',e.message);DIR=path.join(__dirname,'data');fs.mkdirSync(DIR,{recursive:true})}
const FILE=path.join(DIR,'db.json');
process.on('uncaughtException',e=>console.error(e));
let DB={groups:{}};try{DB=JSON.parse(fs.readFileSync(FILE,'utf8'))}catch(e){}
const save=()=>{const t=FILE+'.tmp';fs.writeFileSync(t,JSON.stringify(DB));fs.renameSync(t,FILE)};
const H=(p,s)=>crypto.createHash('sha256').update(s+':'+p).digest('hex');
const cl=(s,n=24)=>String(s||'').trim().slice(0,n),key=u=>cl(u,20).toLowerCase();
const num=(v,max)=>Math.max(0,Math.min(max,Math.round(+v||0)));
const FAIL={};setInterval(()=>{for(const k in FAIL)delete FAIL[k]},6e5);
class E extends Error{constructor(m,c=400){super(m);this.c=c}}
const board=g=>Object.values(g.m).map(m=>({u:m.n,st:m.st||0,wk:m.wk||0,mo:m.mo||0,hb:m.hb||0,ph:m.ph||'',t:m.t||0,own:m.k==g.owner}));
const out=(g,x)=>({name:g.name,board:board(g),...x});
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
sync(b){const g=grp(b),m=mem(g,b),s=b.stats||{};m.st=num(s.st,9999);m.wk=num(s.wk,100);m.mo=num(s.mo,100);m.hb=num(s.hb,99);if(typeof s.ph=='string'&&s.ph.length<6000&&/^data:image\/jpeg;base64,[A-Za-z0-9+\/=]+$/.test(s.ph))m.ph=s.ph;else if(!s.ph)delete m.ph;m.t=Date.now();save();return out(g)},
kick(b){const g=grp(b),m=mem(g,b),t=key(b.target);if(g.owner!==m.k)throw new E('Solo el dueño puede sacar miembros.',403);if(t===g.owner)throw new E('No puedes sacarte a ti mismo.');delete g.m[t];save();return out(g)},
leave(b){const g=grp(b),m=mem(g,b),code=cl(b.code,6).toUpperCase();delete g.m[m.k];const ks=Object.keys(g.m);if(!ks.length)delete DB.groups[code];else if(g.owner===m.k)g.owner=ks[0];save();return{ok:true}},
destroy(b){const g=grp(b),m=mem(g,b);if(g.owner!==m.k)throw new E('Solo el dueño puede eliminar el grupo.',403);delete DB.groups[cl(b.code,6).toUpperCase()];save();return{ok:true}}
};
const T={'.html':'text/html','.json':'application/json','.svg':'image/svg+xml','.js':'text/javascript','.png':'image/png'};
http.createServer((q,r)=>{
 if(q.url.startsWith('/api/ping')){r.writeHead(200,{'Content-Type':'application/json'});return r.end(JSON.stringify({ok:true,grupos:Object.keys(DB.groups).length,datos:DIR}))}
 if(q.url.startsWith('/api/')){
  if(q.method!=='POST'){r.writeHead(405,{'Content-Type':'application/json'});return r.end('{"error":"Método no permitido"}')}
  let d='';q.on('data',c=>{d+=c;if(d.length>15e3)q.destroy()});
  q.on('end',()=>{let o,c=200;try{const n=q.url.slice(5).split('?')[0];if(!Object.hasOwn(A,n))throw new E('No existe',404);o=A[n](JSON.parse(d||'{}'))}
   catch(e){const k=e instanceof E;c=k?e.c:400;o={error:k?e.message:'Solicitud inválida'};if(!k)console.error(e)}
   r.writeHead(c,{'Content-Type':'application/json'});r.end(JSON.stringify(o))});return}
 let p=q.url.split('?')[0];if(p==='/')p='/index.html';
 const f=path.join(__dirname,'public',path.normalize(p).replace(/^(\.\.[\/\\])+/,''));
 fs.readFile(f,(e,x)=>{if(e){r.writeHead(404);return r.end('No encontrado')}r.writeHead(200,{'Content-Type':T[path.extname(f)]||'text/plain'});r.end(x)});
}).listen(process.env.PORT||3000,()=>console.log('ARC activo'));
