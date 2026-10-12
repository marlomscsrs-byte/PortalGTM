require("dotenv").config();
const express=require("express"),session=require("express-session"),PgSession=require("connect-pg-simple")(session);
const {Pool}=require("pg"),bcrypt=require("bcryptjs"),helmet=require("helmet"),path=require("path");
const app=express(),port=Number(process.env.PORT||3000);
if(!process.env.DATABASE_URL||!process.env.SESSION_SECRET){console.error("Configure DATABASE_URL e SESSION_SECRET.");process.exit(1);}
const pool=new Pool({connectionString:process.env.DATABASE_URL,ssl:process.env.NODE_ENV==="production"?{rejectUnauthorized:false}:undefined,max:5});
app.set("trust proxy",1);app.use(helmet({contentSecurityPolicy:false}));app.use(express.json({limit:"100kb"}));
app.use(session({store:new PgSession({pool,tableName:"user_sessions",createTableIfMissing:true}),name:"gtm.sid",secret:process.env.SESSION_SECRET,resave:false,saveUninitialized:false,cookie:{httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"lax",maxAge:43200000}}));
app.use(express.static(path.join(__dirname,"public")));
const roles=["Comandante","Subcomandante","Supervisor","Capitão","Piloto Veterano","Piloto Oficial","Piloto","Probatório"];
const clean=v=>String(v??"").trim(), me=req=>req.session.user;
function fail(status,message){const e=new Error(message);e.status=status;return e}
function auth(req,res,next){if(!me(req))return res.status(401).json({error:"Faça login para continuar."});next()}
function admin(req,res,next){if(!me(req))return res.status(401).json({error:"Faça login para continuar."});if(!me(req).isAdmin)return res.status(403).json({error:"Acesso restrito à administração."});next()}
function publicUser(r){return {id:r.id,passportId:r.passport_id,fullName:r.full_name,badge:r.badge||"",rank:r.rank||"",role:r.role,status:r.status,isAdmin:r.is_admin}}
async function audit(client,user,action,target,details={}){await client.query("INSERT INTO audit_log(actor_user_id,action,target_passport_id,details) VALUES($1,$2,$3,$4)",[user||null,action,target||null,JSON.stringify(details)])}
async function bootstrap(){
 await pool.query("CREATE TABLE IF NOT EXISTS user_sessions(sid varchar NOT NULL PRIMARY KEY,sess json NOT NULL,expire timestamp(6) NOT NULL); CREATE INDEX IF NOT EXISTS idx_session_expire ON user_sessions(expire)");
 const id=clean(process.env.ADMIN_ID),name=clean(process.env.ADMIN_NAME||"Administrador GTM"),password=clean(process.env.ADMIN_PASSWORD);
 if(!id||!password||password.startsWith("troque-")){console.warn("Configure ADMIN_ID e ADMIN_PASSWORD forte para criar o primeiro administrador.");return}
 const exists=await pool.query("SELECT id FROM users WHERE passport_id=$1",[id]);if(exists.rowCount)return;
 await pool.query("INSERT INTO users(passport_id,full_name,rank,role,status,password_hash,is_admin,access_status,approved_at,entry_date) VALUES($1,$2,'Administração','Comandante','Ativo',$3,TRUE,'APROVADO',NOW(),CURRENT_DATE)",[id,name,await bcrypt.hash(password,12)]);
}
app.get("/api/health",async(_q,s)=>{try{await pool.query("SELECT 1");s.json({ok:true,database:"connected"})}catch{s.status(503).json({ok:false,database:"unavailable"})}});
app.get("/api/auth/me",(q,s)=>s.json({user:me(q)||null}));
app.post("/api/auth/register",async(q,s,n)=>{try{
 const id=clean(q.body.passportId),name=clean(q.body.fullName),role=clean(q.body.role),pass=String(q.body.password||"");
 if(!/^\d{1,12}$/.test(id))throw fail(400,"ID numérico inválido.");
 if(name.length<2||name.length>120)throw fail(400,"Informe seu nome completo.");
 if(!roles.includes(role))throw fail(400,"Cargo inválido.");
 if(pass.length<8||!/[A-Z]/.test(pass)||!/[a-z]/.test(pass)||!/\d/.test(pass))throw fail(400,"Senha: mínimo 8 caracteres, maiúscula, minúscula e número.");
 if((await pool.query("SELECT 1 FROM users WHERE passport_id=$1 AND access_status='APROVADO'",[id])).rowCount)throw fail(409,"Este ID já possui acesso.");
 if((await pool.query("SELECT 1 FROM access_requests WHERE passport_id=$1 AND status='PENDENTE'",[id])).rowCount)throw fail(409,"Já existe solicitação pendente para este ID.");
 await pool.query("INSERT INTO access_requests(passport_id,full_name,requested_role,password_hash) VALUES($1,$2,$3,$4)",[id,name,role,await bcrypt.hash(pass,12)]);
 s.status(201).json({message:"Solicitação enviada. Aguarde a aprovação."});
}catch(e){n(e)}});
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
 s.json({counts:{total:total.rows[0].n,active:active.rows[0].n,onDuty:duty.rows[0].n,pending:q.session.user.isAdmin?pending.rows[0].n:null},recentClock:recent.rows,myOpenClock:own.rows[0]||null});
}catch(e){n(e)}});
app.get("/api/people",auth,async(q,s,n)=>{try{
 const term="%"+clean(q.query.q)+"%",status=clean(q.query.status);
 const r=await pool.query(`SELECT id,passport_id,full_name,badge,rank,role,status,entry_date FROM users WHERE access_status='APROVADO' AND (full_name ILIKE $1 OR passport_id ILIKE $1 OR role ILIKE $1) AND ($2='' OR status=$2) ORDER BY CASE role WHEN 'Comandante' THEN 1 WHEN 'Subcomandante' THEN 2 WHEN 'Supervisor' THEN 3 WHEN 'Capitão' THEN 4 WHEN 'Piloto Veterano' THEN 5 WHEN 'Piloto Oficial' THEN 6 WHEN 'Piloto' THEN 7 WHEN 'Probatório' THEN 8 ELSE 9 END,full_name`,[term,status]);s.json({people:r.rows});
}catch(e){n(e)}});
app.post("/api/clock/toggle",auth,async(q,s,n)=>{const c=await pool.connect();try{await c.query("BEGIN");const open=await c.query("SELECT id FROM clock_entries WHERE user_id=$1 AND clock_out IS NULL ORDER BY clock_in DESC LIMIT 1 FOR UPDATE",[q.session.user.id]);let result,state,action;
 if(open.rowCount){result=await c.query("UPDATE clock_entries SET clock_out=NOW() WHERE id=$1 RETURNING *",[open.rows[0].id]);state="out";action="PONTO_SAIDA"}else{result=await c.query("INSERT INTO clock_entries(user_id) VALUES($1) RETURNING *",[q.session.user.id]);state="in";action="PONTO_ENTRADA"}
 await audit(c,q.session.user.id,action,q.session.user.passportId);await c.query("COMMIT");s.json({state,entry:result.rows[0],message:state==="in"?"Entrada registrada.":"Saída registrada."});
}catch(e){await c.query("ROLLBACK");n(e)}finally{c.release()}});
app.get("/api/clock/history",auth,async(q,s,n)=>{try{const r=await pool.query("SELECT id,clock_in,clock_out FROM clock_entries WHERE user_id=$1 ORDER BY clock_in DESC LIMIT 30",[q.session.user.id]);s.json({entries:r.rows})}catch(e){n(e)}});
app.get("/api/admin/access-requests",admin,async(q,s,n)=>{try{const r=await pool.query("SELECT id,passport_id,full_name,requested_role,requested_at FROM access_requests WHERE status='PENDENTE' ORDER BY requested_at");s.json({requests:r.rows})}catch(e){n(e)}});
app.post("/api/admin/access-requests/:id/review",admin,async(q,s,n)=>{const c=await pool.connect();try{
 const id=Number(q.params.id),decision=clean(q.body.decision).toUpperCase(),note=clean(q.body.note);if(!Number.isInteger(id)||!["APROVADO","REJEITADO"].includes(decision))throw fail(400,"Solicitação inválida.");
 await c.query("BEGIN");const found=await c.query("SELECT * FROM access_requests WHERE id=$1 FOR UPDATE",[id]);if(!found.rowCount||found.rows[0].status!=="PENDENTE")throw fail(409,"Solicitação já analisada ou não encontrada.");
 const r=found.rows[0];if(decision==="APROVADO"){
 const old=await c.query("SELECT id FROM users WHERE passport_id=$1 FOR UPDATE",[r.passport_id]);
 if(old.rowCount)await c.query("UPDATE users SET full_name=$2,role=$3,status='Ativo',password_hash=$4,access_status='APROVADO',approved_at=NOW(),approved_by=$5,updated_at=NOW() WHERE passport_id=$1",[r.passport_id,r.full_name,r.requested_role,r.password_hash,q.session.user.id]);
 else await c.query("INSERT INTO users(passport_id,full_name,role,status,password_hash,is_admin,access_status,requested_at,approved_at,approved_by,entry_date) VALUES($1,$2,$3,'Ativo',$4,FALSE,'APROVADO',$5,NOW(),$6,CURRENT_DATE)",[r.passport_id,r.full_name,r.requested_role,r.password_hash,r.requested_at,q.session.user.id]);
 }
 await c.query("UPDATE access_requests SET status=$2,reviewed_at=NOW(),reviewed_by=$3,review_note=$4 WHERE id=$1",[id,decision,q.session.user.id,note]);await audit(c,q.session.user.id,"CADASTRO_"+decision,r.passport_id,{role:r.requested_role,note});await c.query("COMMIT");
 s.json({message:decision==="APROVADO"?"Aprovado e adicionado ao efetivo.":"Solicitação rejeitada."});
}catch(e){await c.query("ROLLBACK").catch(()=>{});n(e)}finally{c.release()}});
app.use("/api",(e,q,s,n)=>{console.error(e);s.status(e.status||500).json({error:e.status?e.message:"Erro interno do servidor."})});
(async()=>{await bootstrap();app.listen(port,()=>console.log("Portal GTM na porta "+port))})().catch(e=>{console.error(e);process.exit(1)});
