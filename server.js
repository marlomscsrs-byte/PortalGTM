require("dotenv").config();
const express=require("express"),session=require("express-session"),PgSession=require("connect-pg-simple")(session);
const {Pool}=require("pg"),bcrypt=require("bcryptjs"),helmet=require("helmet"),path=require("path");
const app=express(),port=Number(process.env.PORT||3000);
if(!process.env.DATABASE_URL||!process.env.SESSION_SECRET){console.error("Configure DATABASE_URL e SESSION_SECRET.");process.exit(1);}
const pool=new Pool({connectionString:process.env.DATABASE_URL,ssl:process.env.NODE_ENV==="production"?{rejectUnauthorized:false}:undefined,max:5});
app.set("trust proxy",1);app.use(helmet({contentSecurityPolicy:false}));app.use(express.json({limit:"100kb"}));
app.use(session({store:new PgSession({pool,tableName:"user_sessions",createTableIfMissing:true}),name:"gtm.sid",secret:process.env.SESSION_SECRET,resave:false,saveUninitialized:false,cookie:{httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"lax",maxAge:43200000}}));
app.use(express.static(path.join(__dirname,"public")));
const roles=["Comandante", "Subcomandante", "Supervisor", "Capitão", "Piloto Veterano", "Piloto Oficial", "Piloto Probatório"];
const ranks=["Recruta","Soldado","Cabo","3SGT","2SGT","1SGT","Subtenente","Aspirante a Oficial","2º Tenente","1º Tenente","Capitão","Major","Tenente-Coronel","Coronel"];
const clean=v=>String(v??"").trim(), me=req=>req.session.user;
const ADMIN_ID=clean(process.env.ADMIN_ID||"284");
const commandRoles=["Comandante","Subcomandante"];
const canManageUser=u=>!!u&&(u.isAdmin||commandRoles.includes(u.role));
function fail(status,message){const e=new Error(message);e.status=status;return e}
function auth(req,res,next){if(!me(req))return res.status(401).json({error:"Faça login para continuar."});next()}
function admin(req,res,next){if(!me(req))return res.status(401).json({error:"Faça login para continuar."});if(!me(req).isAdmin)return res.status(403).json({error:"Acesso restrito ao administrador do sistema."});next()}
function commandAccess(req,res,next){if(!me(req))return res.status(401).json({error:"Faça login para continuar."});if(!canManageUser(me(req)))return res.status(403).json({error:"Ação restrita ao Comando, Subcomando e administrador do sistema."});next()}
function publicUser(r){const isAdmin=String(r.passport_id)===ADMIN_ID;return {id:r.id,passportId:r.passport_id,fullName:r.full_name,phone:r.phone||"",badge:r.badge||"",rank:r.rank||"",role:r.role,status:r.status,isAdmin,canManage:isAdmin||commandRoles.includes(r.role)}}
async function audit(client,user,action,target,details={}){await client.query("INSERT INTO audit_log(actor_user_id,action,target_passport_id,details) VALUES($1,$2,$3,$4)",[user||null,action,target||null,JSON.stringify(details)])}
async function bootstrap(){
 await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(20) NOT NULL DEFAULT ''");
 await pool.query("CREATE TABLE IF NOT EXISTS user_sessions(sid varchar NOT NULL PRIMARY KEY,sess json NOT NULL,expire timestamp(6) NOT NULL); CREATE INDEX IF NOT EXISTS idx_session_expire ON user_sessions(expire)");
 await pool.query(`CREATE TABLE IF NOT EXISTS operational_records(
  id BIGSERIAL PRIMARY KEY, reporter_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  reporter_passport_id VARCHAR(32) NOT NULL, reporter_name VARCHAR(120) NOT NULL,
  record_type VARCHAR(40) NOT NULL, qru VARCHAR(100) NOT NULL, occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  description TEXT NOT NULL DEFAULT '', involved TEXT NOT NULL DEFAULT '', vehicle TEXT NOT NULL DEFAULT '',
  photo_url TEXT NOT NULL DEFAULT '', discord_status VARCHAR(20) NOT NULL DEFAULT 'PENDENTE',
  discord_error TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
 )`);
 await pool.query("ALTER TABLE operational_records ALTER COLUMN description SET DEFAULT ''");
 await pool.query("CREATE INDEX IF NOT EXISTS idx_operational_records_created ON operational_records(created_at DESC)");
 // Preserva o primeiro pedido pendente de cada ID e marca os demais como duplicados,
 // sem apagar histórico. Depois, uma restrição no PostgreSQL impede novas duplicatas,
 // inclusive quando duas requisições chegam ao mesmo tempo.
 await pool.query(`WITH ranked AS (
   SELECT id, ROW_NUMBER() OVER (PARTITION BY passport_id ORDER BY requested_at ASC, id ASC) AS rn
   FROM access_requests WHERE status='PENDENTE'
 )
 UPDATE access_requests a
 SET status='REJEITADO', reviewed_at=COALESCE(a.reviewed_at,NOW()),
     review_note=CASE WHEN COALESCE(a.review_note,'')='' THEN 'Duplicata automática: outra solicitação pendente para este ID foi preservada.' ELSE a.review_note || ' | Duplicata automática: outra solicitação pendente para este ID foi preservada.' END
 FROM ranked r WHERE a.id=r.id AND r.rn>1`);
 await pool.query("CREATE UNIQUE INDEX IF NOT EXISTS idx_access_requests_one_pending_per_passport ON access_requests(passport_id) WHERE status='PENDENTE'");
 const id=ADMIN_ID,name=clean(process.env.ADMIN_NAME||"Administrador GTM"),password=clean(process.env.ADMIN_PASSWORD);
 await pool.query("UPDATE users SET is_admin=(passport_id=$1)",[id]);
 if(!id||!password||password.startsWith("troque-")){console.warn("Configure ADMIN_ID e ADMIN_PASSWORD forte para criar o primeiro administrador.");return}
 const exists=await pool.query("SELECT id FROM users WHERE passport_id=$1",[id]);if(exists.rowCount)return;
 await pool.query("INSERT INTO users(passport_id,full_name,rank,role,status,password_hash,is_admin,access_status,approved_at,entry_date) VALUES($1,$2,'Administração','Comandante','Ativo',$3,TRUE,'APROVADO',NOW(),CURRENT_DATE)",[id,name,await bcrypt.hash(password,12)]);
}
// Liveness: endpoint leve para Render e monitor externo. Não depende do banco.
app.get("/api/health",(_q,s)=>s.status(200).json({ok:true,service:"portal-gtm",status:"alive"}));
// Readiness: verifica separadamente se o PostgreSQL está acessível.
app.get("/api/ready",async(_q,s)=>{try{await pool.query("SELECT 1");s.status(200).json({ok:true,database:"connected"})}catch{s.status(503).json({ok:false,database:"unavailable"})}});
app.get("/api/auth/me",async(q,s,n)=>{try{if(!me(q))return s.json({user:null});const r=await pool.query("SELECT * FROM users WHERE passport_id=$1 AND access_status='APROVADO'",[me(q).passportId]);if(!r.rowCount){q.session.user=null;return s.json({user:null})}q.session.user=publicUser(r.rows[0]);s.json({user:q.session.user})}catch(e){n(e)}});
app.put("/api/profile",auth,async(q,s,n)=>{try{const phone=clean(q.body.phone);const digits=phone.replace(/\D/g,"");if(phone&&digits.length!==6)throw fail(400,"Informe o telefone do RP com seis números no formato XXX-XXX.");const formatted=digits?`${digits.slice(0,3)}-${digits.slice(3)}`:"";const r=await pool.query("UPDATE users SET phone=$2,updated_at=NOW() WHERE passport_id=$1 AND access_status='APROVADO' RETURNING *",[me(q).passportId,formatted]);if(!r.rowCount)throw fail(404,"Perfil não encontrado.");q.session.user=publicUser(r.rows[0]);s.json({message:"Telefone do RP atualizado com sucesso.",user:q.session.user});}catch(e){n(e)}});
app.post("/api/auth/register",async(q,s,n)=>{try{
 const id=clean(q.body.passportId),name=clean(q.body.fullName),role=clean(q.body.role),pass=String(q.body.password||"");
 if(!/^\d{1,12}$/.test(id))throw fail(400,"ID numérico inválido.");
 if(name.length<2||name.length>120)throw fail(400,"Informe seu nome completo.");
 if(!roles.includes(role))throw fail(400,"Selecione um dos cargos disponíveis.");
 if(pass.length<8||!/[A-Z]/.test(pass)||!/[a-z]/.test(pass)||!/\d/.test(pass))throw fail(400,"Senha: mínimo 8 caracteres, maiúscula, minúscula e número.");
 if((await pool.query("SELECT 1 FROM users WHERE passport_id=$1 AND access_status='APROVADO'",[id])).rowCount)throw fail(409,"Este ID já possui acesso.");
 if((await pool.query("SELECT 1 FROM access_requests WHERE passport_id=$1 AND status='PENDENTE'",[id])).rowCount)throw fail(409,"Já existe solicitação pendente para este ID.");
 await pool.query("INSERT INTO access_requests(passport_id,full_name,requested_role,password_hash) VALUES($1,$2,$3,$4)",[id,name,role,await bcrypt.hash(pass,12)]);
 s.status(201).json({message:"Solicitação enviada. Aguarde a aprovação."});
}catch(e){if(e.code==="23505")return s.status(409).json({error:"Já existe uma solicitação pendente para este ID. Não é necessário enviar novamente."});n(e)}});
app.post("/api/auth/login",async(q,s,n)=>{try{
 const r=await pool.query("SELECT * FROM users WHERE passport_id=$1",[clean(q.body.passportId)]);
 if(!r.rowCount||!r.rows[0].password_hash||!(await bcrypt.compare(String(q.body.password||""),r.rows[0].password_hash)))throw fail(401,"ID ou senha incorretos.");
 const u=r.rows[0];if(u.access_status!=="APROVADO"||u.status!=="Ativo")throw fail(403,"Acesso não liberado ou cadastro inativo.");
 q.session.user=publicUser(u);s.json({user:q.session.user});
}catch(e){n(e)}});
app.post("/api/auth/logout",(q,s)=>q.session.destroy(()=>{s.clearCookie("gtm.sid");s.json({message:"Sessão encerrada."})}));
app.get("/api/dashboard",auth,async(q,s,n)=>{try{
 const [total,active,duty,pending,recent,own]=await Promise.all([
 pool.query("SELECT COUNT(*)::int n FROM users WHERE access_status='APROVADO'"),
 pool.query("SELECT COUNT(*)::int n FROM users WHERE access_status='APROVADO' AND status='Ativo'"),
 pool.query("SELECT COUNT(*)::int n FROM clock_entries WHERE clock_out IS NULL"),
 pool.query("SELECT COUNT(*)::int n FROM access_requests WHERE status='PENDENTE'"),
 pool.query("SELECT c.clock_in,c.clock_out,u.full_name,u.passport_id FROM clock_entries c JOIN users u ON u.id=c.user_id ORDER BY c.clock_in DESC LIMIT 8"),
 pool.query("SELECT id,clock_in FROM clock_entries WHERE user_id=$1 AND clock_out IS NULL ORDER BY clock_in DESC LIMIT 1",[q.session.user.id])]);
 s.json({counts:{total:total.rows[0].n,active:active.rows[0].n,onDuty:duty.rows[0].n,pending:canManageUser(q.session.user)?pending.rows[0].n:null},recentClock:recent.rows,myOpenClock:own.rows[0]||null});
}catch(e){n(e)}});
app.get("/api/people",auth,async(q,s,n)=>{try{
 const term="%"+clean(q.query.q)+"%",status=clean(q.query.status);
 const r=await pool.query(`SELECT id,passport_id,full_name,badge,rank,role,status,entry_date FROM users WHERE access_status='APROVADO' AND (full_name ILIKE $1 OR passport_id ILIKE $1 OR role ILIKE $1) AND ($2='' OR status=$2) ORDER BY CASE role WHEN 'Comandante' THEN 1 WHEN 'Subcomandante' THEN 2 WHEN 'Supervisor' THEN 3 WHEN 'Capitão' THEN 4 WHEN 'Piloto Veterano' THEN 5 WHEN 'Piloto Oficial' THEN 6 WHEN 'Piloto Probatório' THEN 7 ELSE 8 END,full_name`,[term,status]);s.json({people:r.rows});
}catch(e){n(e)}});

app.put("/api/people/:passportId",commandAccess,async(q,s,n)=>{try{
 const target=clean(q.params.passportId),fullName=clean(q.body.fullName),rank=clean(q.body.rank),role=clean(q.body.role),status=clean(q.body.status),entryDate=clean(q.body.entryDate);
 if(!/^\d{1,12}$/.test(target))throw fail(400,"ID inválido.");
 if(target===ADMIN_ID&&!me(q).isAdmin)throw fail(403,"Somente o administrador ID configurado no Render pode editar o próprio perfil administrativo.");
 if(fullName.length<2||fullName.length>120)throw fail(400,"Informe um nome entre 2 e 120 caracteres.");
 if(!roles.includes(role))throw fail(400,"Cargo inválido.");
 if(!["Ativo","Inativo","Afastado"].includes(status))throw fail(400,"Status inválido.");
 if(entryDate&&!/^\d{4}-\d{2}-\d{2}$/.test(entryDate))throw fail(400,"Data de entrada inválida.");
 if(!me(q).isAdmin&&(role==="Comandante"||role==="Subcomandante"))throw fail(403,"Somente o administrador do sistema pode atribuir os cargos de Comandante ou Subcomandante.");
 const c=await pool.connect();try{await c.query("BEGIN");const old=await c.query("SELECT id,role FROM users WHERE passport_id=$1 AND access_status='APROVADO' FOR UPDATE",[target]);if(!old.rowCount)throw fail(404,"Integrante não encontrado.");if(!me(q).isAdmin&&["Comandante","Subcomandante"].includes(old.rows[0].role))throw fail(403,"Somente o administrador do sistema pode alterar os perfis do Comando.");
 const updated=await c.query("UPDATE users SET full_name=$2,rank=$3,role=$4,status=$5,entry_date=CASE WHEN $6='' THEN entry_date ELSE $6::date END,updated_at=NOW(),is_admin=(passport_id=$7) WHERE passport_id=$1 RETURNING passport_id,full_name,rank,role,status,entry_date",[target,fullName,rank,role,status,entryDate,ADMIN_ID]);
 await audit(c,me(q).id,"PERFIL_EDITADO",target,{role,status});await c.query("COMMIT");s.json({message:"Perfil atualizado.",person:updated.rows[0]});}catch(e){await c.query("ROLLBACK").catch(()=>{});throw e}finally{c.release()}
 }catch(e){n(e)}});

app.get("/api/operational-records",auth,async(q,s,n)=>{try{
 const r=await pool.query("SELECT id,reporter_passport_id,reporter_name,record_type,qru,occurred_at,description,involved,vehicle,photo_url,discord_status,created_at FROM operational_records ORDER BY created_at DESC LIMIT 100");
 s.json({records:r.rows});
}catch(e){n(e)}});
app.post("/api/operational-records",auth,async(q,s,n)=>{const c=await pool.connect();let record;
 try{
   const qru=clean(q.body.qru),vehicle=clean(q.body.vehicle),photoUrl=clean(q.body.photoUrl),dateValue=clean(q.body.date);
  const involvedIds=Array.isArray(q.body.involvedIds)?[...new Set(q.body.involvedIds.map(v=>clean(v)).filter(v=>/^\d{1,12}$/.test(v)))]:[];
  if(qru.length<2||qru.length>100)throw fail(400,"Informe a QRU (até 100 caracteres).");
  if(!/^\d{4}-\d{2}-\d{2}$/.test(dateValue)||Number.isNaN(Date.parse(dateValue+"T12:00:00-03:00")))throw fail(400,"Informe uma data válida.");
  if(!involvedIds.length||involvedIds.length>20||!vehicle||vehicle.length>500)throw fail(400,"Selecione de 1 a 20 envolvidos e preencha o veículo.");
  if(!/^https:\/\/\S+$/i.test(photoUrl)||photoUrl.length>1000)throw fail(400,"Informe um link HTTPS válido para a foto/evidência.");
  const involvedResult=await pool.query("SELECT passport_id,full_name FROM users WHERE access_status='APROVADO' AND status='Ativo' AND passport_id::text=ANY($1::text[])",[involvedIds]);
  if(involvedResult.rowCount!==involvedIds.length)throw fail(400,"Um ou mais envolvidos não estão cadastrados como integrantes ativos. Faça a busca novamente.");
  const involvedById=new Map(involvedResult.rows.map(p=>[String(p.passport_id),p]));
  const involved=involvedIds.map(id=>{const p=involvedById.get(id);return `${p.full_name} — ID ${p.passport_id}`}).join("\n");
  if(involved.length>1500)throw fail(400,"A lista de envolvidos ficou muito longa. Selecione menos integrantes.");
  await c.query("BEGIN");
  const saved=await c.query(`INSERT INTO operational_records(reporter_user_id,reporter_passport_id,reporter_name,record_type,qru,occurred_at,description,involved,vehicle,photo_url)
   VALUES($1,$2,$3,'QRU',$4,$5,'',$6,$7,$8) RETURNING *`,
   [q.session.user.id,q.session.user.passportId,q.session.user.fullName,qru,new Date(dateValue+"T12:00:00-03:00"),involved,vehicle,photoUrl]);
  record=saved.rows[0];
  await audit(c,q.session.user.id,"REGISTRO_OPERACIONAL",q.session.user.passportId,{recordId:record.id,recordType:"QRU",qru});
  await c.query("COMMIT");
 }catch(e){await c.query("ROLLBACK").catch(()=>{});c.release();return n(e)}
 c.release();
 const webhook=clean(process.env.DISCORD_WEBHOOK_QRU);
 if(!webhook){await pool.query("UPDATE operational_records SET discord_status='NAO_CONFIGURADO' WHERE id=$1",[record.id]);return s.status(201).json({message:"Registro salvo no portal. O Discord não foi enviado porque DISCORD_WEBHOOK_QRU não está configurado.",recordId:record.id,discordSent:false})}
 try{
  const fields=[
   {name:"Piloto",value:`${record.reporter_name} — ID ${record.reporter_passport_id}`,inline:false},
   {name:"Data",value:new Date(record.occurred_at).toLocaleDateString("pt-BR",{timeZone:"America/Sao_Paulo"}),inline:true},
   {name:"QRU",value:record.qru,inline:true},
   {name:"Envolvidos",value:record.involved.length>1024?record.involved.slice(0,1000)+"\n… lista completa salva no portal":record.involved,inline:false},
   {name:"Veículo",value:record.vehicle.slice(0,1024),inline:false}
  ];
  const resp=await fetch(webhook,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({username:"GTM Villa | Registro Operacional",embeds:[{title:"🚨 Novo Registro de QRU",color:0x5e6873,fields,image:{url:record.photo_url},timestamp:new Date(record.created_at).toISOString(),footer:{text:`Registro GTM #${record.id}`}}]})});
  if(!resp.ok)throw new Error(`Discord respondeu HTTP ${resp.status}`);
  await pool.query("UPDATE operational_records SET discord_status='ENVIADO',discord_error=NULL WHERE id=$1",[record.id]);
  s.status(201).json({message:"Registro salvo e enviado ao Discord.",recordId:record.id,discordSent:true});
 }catch(e){
  console.error("Falha ao enviar registro ao Discord:",e.message);
  await pool.query("UPDATE operational_records SET discord_status='ERRO',discord_error=$2 WHERE id=$1",[record.id,String(e.message).slice(0,500)]).catch(()=>{});
  s.status(201).json({message:"Registro salvo no portal, mas não foi possível enviar ao Discord. Confira o webhook no Render.",recordId:record.id,discordSent:false});
 }
});

app.post("/api/clock/toggle",auth,async(q,s,n)=>{const c=await pool.connect();try{await c.query("BEGIN");const open=await c.query("SELECT id FROM clock_entries WHERE user_id=$1 AND clock_out IS NULL ORDER BY clock_in DESC LIMIT 1 FOR UPDATE",[q.session.user.id]);let result,state,action;
 if(open.rowCount){result=await c.query("UPDATE clock_entries SET clock_out=NOW() WHERE id=$1 RETURNING *",[open.rows[0].id]);state="out";action="PONTO_SAIDA"}else{result=await c.query("INSERT INTO clock_entries(user_id) VALUES($1) RETURNING *",[q.session.user.id]);state="in";action="PONTO_ENTRADA"}
 await audit(c,q.session.user.id,action,q.session.user.passportId);await c.query("COMMIT");s.json({state,entry:result.rows[0],message:state==="in"?"Entrada registrada.":"Saída registrada."});
}catch(e){await c.query("ROLLBACK");n(e)}finally{c.release()}});
app.get("/api/clock/history",auth,async(q,s,n)=>{try{const r=await pool.query("SELECT id,clock_in,clock_out FROM clock_entries WHERE user_id=$1 ORDER BY clock_in DESC LIMIT 30",[q.session.user.id]);s.json({entries:r.rows})}catch(e){n(e)}});
async function getClockReport(start,end){
 const params=[start,end];
 const filter=`c.clock_in >= ($1::date::timestamp AT TIME ZONE 'America/Sao_Paulo') AND c.clock_in < (($2::date + INTERVAL '1 day')::timestamp AT TIME ZONE 'America/Sao_Paulo')`;
 const entries=await pool.query(`SELECT u.full_name,u.passport_id,u.rank,u.role,c.clock_in,c.clock_out,GREATEST(0,FLOOR(EXTRACT(EPOCH FROM (COALESCE(c.clock_out,NOW())-c.clock_in))))::bigint AS duration_seconds FROM clock_entries c JOIN users u ON u.id=c.user_id WHERE u.access_status='APROVADO' AND ${filter} ORDER BY c.clock_in DESC`,params);
 const members=await pool.query(`SELECT u.full_name,u.passport_id,u.rank,u.role,COUNT(c.id)::int AS entries,COALESCE(SUM(GREATEST(0,EXTRACT(EPOCH FROM (COALESCE(c.clock_out,NOW())-c.clock_in)))),0)::bigint AS total_seconds FROM clock_entries c JOIN users u ON u.id=c.user_id WHERE u.access_status='APROVADO' AND ${filter} GROUP BY u.id,u.full_name,u.passport_id,u.rank,u.role ORDER BY total_seconds DESC,u.full_name ASC`,params);
 const totalSeconds=members.rows.reduce((sum,row)=>sum+Number(row.total_seconds||0),0);
 return {members:members.rows,entries:entries.rows,summary:{totalSeconds,members:members.rowCount,entries:entries.rowCount}};
}
function validReportDates(q){const start=clean(q.query.start),end=clean(q.query.end);if(!/^\d{4}-\d{2}-\d{2}$/.test(start)||!/^\d{4}-\d{2}-\d{2}$/.test(end)||start>end)throw fail(400,"Informe datas válidas no formato AAAA-MM-DD.");return {start,end}}
app.get("/api/clock/report",commandAccess,async(q,s,n)=>{try{const {start,end}=validReportDates(q);s.json(await getClockReport(start,end))}catch(e){n(e)}});
app.get("/api/clock/report.csv",commandAccess,async(q,s,n)=>{try{const {start,end}=validReportDates(q),report=await getClockReport(start,end);const csvCell=v=>`"${String(v??"").replace(/"/g,'""')}"`;const rows=[["Integrante","ID","Patente","Cargo","Entrada","Saída","Duração (segundos)","Duração (horas)","Situação"]];for(const x of report.entries){const sec=Number(x.duration_seconds||0);const localDate=v=>v?new Date(v).toLocaleString("pt-BR",{timeZone:"America/Sao_Paulo"}):"";rows.push([x.full_name,x.passport_id,x.rank||"",x.role,localDate(x.clock_in),localDate(x.clock_out),sec,(sec/3600).toFixed(2),x.clock_out?"Finalizado":"Em serviço"])}const csv="\uFEFF"+rows.map(row=>row.map(csvCell).join(";")).join("\r\n");s.setHeader("Content-Type","text/csv; charset=utf-8");s.setHeader("Content-Disposition",`attachment; filename="relatorio-jornada-${start}-${end}.csv"`);s.send(csv)}catch(e){n(e)}});
app.get("/api/admin/access-requests",commandAccess,async(q,s,n)=>{try{const r=await pool.query("SELECT id,passport_id,full_name,requested_role,requested_at FROM access_requests WHERE status='PENDENTE' ORDER BY requested_at");s.json({requests:r.rows})}catch(e){n(e)}});
app.post("/api/admin/access-requests/:id/review",commandAccess,async(q,s,n)=>{const c=await pool.connect();try{
 const id=Number(q.params.id),decision=clean(q.body.decision).toUpperCase(),note=clean(q.body.note);if(!Number.isInteger(id)||!["APROVADO","REJEITADO"].includes(decision))throw fail(400,"Solicitação inválida.");
 await c.query("BEGIN");const found=await c.query("SELECT * FROM access_requests WHERE id=$1 FOR UPDATE",[id]);if(!found.rowCount||found.rows[0].status!=="PENDENTE")throw fail(409,"Solicitação já analisada ou não encontrada.");
 const r=found.rows[0];if(decision==="APROVADO"&&["Comandante","Subcomandante"].includes(r.requested_role)&&!me(q).isAdmin)throw fail(403,"Somente o administrador do sistema pode aprovar os cargos de Comandante ou Subcomandante.");if(decision==="APROVADO"){
 const old=await c.query("SELECT id FROM users WHERE passport_id=$1 FOR UPDATE",[r.passport_id]);
 if(old.rowCount)await c.query("UPDATE users SET full_name=$2,role=$3,status='Ativo',password_hash=$4,access_status='APROVADO',approved_at=NOW(),approved_by=$5,updated_at=NOW() WHERE passport_id=$1",[r.passport_id,r.full_name,r.requested_role,r.password_hash,q.session.user.id]);
 else await c.query("INSERT INTO users(passport_id,full_name,role,status,password_hash,is_admin,access_status,requested_at,approved_at,approved_by,entry_date) VALUES($1,$2,$3,'Ativo',$4,FALSE,'APROVADO',$5,NOW(),$6,CURRENT_DATE)",[r.passport_id,r.full_name,r.requested_role,r.password_hash,r.requested_at,q.session.user.id]);
 }
 await c.query("UPDATE access_requests SET status=$2,reviewed_at=NOW(),reviewed_by=$3,review_note=$4 WHERE id=$1",[id,decision,q.session.user.id,note]);await audit(c,q.session.user.id,"CADASTRO_"+decision,r.passport_id,{role:r.requested_role,note});await c.query("COMMIT");
 s.json({message:decision==="APROVADO"?"Aprovado e adicionado ao efetivo.":"Solicitação rejeitada."});
}catch(e){await c.query("ROLLBACK").catch(()=>{});n(e)}finally{c.release()}});
app.use("/api",(e,q,s,n)=>{console.error(e);s.status(e.status||500).json({error:e.status?e.message:"Erro interno do servidor."})});
(async()=>{await bootstrap();app.listen(port,()=>console.log("Portal GTM na porta "+port))})().catch(e=>{console.error(e);process.exit(1)});
