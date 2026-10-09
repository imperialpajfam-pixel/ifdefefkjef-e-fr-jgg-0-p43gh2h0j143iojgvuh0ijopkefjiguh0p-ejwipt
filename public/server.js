const http=require('http'),fs=require('fs'),path=require('path');
const T={'.html':'text/html','.json':'application/json','.svg':'image/svg+xml','.js':'text/javascript','.png':'image/png'};
http.createServer((q,r)=>{
  let p=q.url.split('?')[0];if(p==='/')p='/index.html';
  const f=path.join(__dirname,'public',path.normalize(p).replace(/^(\.\.[\/\\])+/,''));
  fs.readFile(f,(e,d)=>{if(e){r.writeHead(404);return r.end('No encontrado')}
    r.writeHead(200,{'Content-Type':T[path.extname(f)]||'text/plain'});r.end(d)});
}).listen(process.env.PORT||3000,()=>console.log('OIGUY activo'));
