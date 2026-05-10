# Shiftly — ระบบจัดเวรแพทย์

## โครงสร้าง
- **backend/** — NestJS + Prisma + PostgreSQL
- **frontend/** — React + Vite + Ant Design
- **docker-compose.yml** — PostgreSQL สำหรับ dev

## Setup (เครื่องใหม่)

### 0) Prerequisites
- Node.js 22+
- Docker Desktop (สำหรับรัน Postgres ใน local)
- Git

### 1) Clone + checkout develop
```bash
git clone git@github.com:Phumarinhrs/shiftly.git
cd shiftly
git checkout develop
```

### 2) Start Postgres (ใน root)
```bash
docker compose up -d postgres
```

### 3) Backend
```bash
cd backend
cp .env.example .env
npm install
npx prisma db push          # สร้าง schema ใน DB
npx prisma db seed          # (ครั้งแรกเท่านั้น) เพิ่ม user ตัวอย่าง
npm run start:dev
```
Backend รันที่ http://localhost:3000

### 4) Frontend (terminal ใหม่)
```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```
Frontend รันที่ http://localhost:5173

---

## Deployment
- **QA**: push ไป `develop` → deploy auto (ผ่าน GitHub Actions ถ้าตั้ง secret แล้ว)
  - Backend: Railway (https://shiftly-production-7023.up.railway.app)
  - Frontend: Vercel (https://shiftly-1v7o30way-phumarinhrs-projects.vercel.app)
- **Production**: push ไป `main`

## คำสั่งที่ใช้บ่อย
```bash
# Backend
npm run start:dev      # รัน dev mode (auto reload)
npm run build          # build production
npx prisma studio      # เปิด DB browser

# Frontend
npm run dev            # รัน dev server
npm run build          # build production
```
