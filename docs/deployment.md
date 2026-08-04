# éƒ¨ç½²æŒ‡å—

## çŽ¯å¢ƒè¦æ±‚

| ä¾èµ– | ç‰ˆæœ¬ | è¯´æ˜Ž |
|------|------|------|
| Node.js | 22+ | æŽ¨è 22.22+ (è£¸æœºéƒ¨ç½²) |
| Docker | 24+ | Docker éƒ¨ç½²æ–¹å¼ |
| PostgreSQL | 14+ | éœ€æ”¯æŒå¤š schema |
| npm | 10+ | éš Node.js å®‰è£… |

## Docker éƒ¨ç½²ï¼ˆæŽ¨èï¼‰

### CI/CD è‡ªåŠ¨æž„å»º

é¡¹ç›®å·²é…ç½® GitHub Actionsï¼ˆ`.github/workflows/deploy.yml`ï¼‰ï¼ŒæŽ¨é€ main åˆ†æ”¯æ—¶è‡ªåŠ¨ï¼š

1. **æž„å»º Docker é•œåƒ** â€” åŸºäºŽ Node.js 22 Alpineï¼Œå¤šé˜¶æ®µæž„å»ºä¼˜åŒ–ä½“ç§¯
2. **æŽ¨é€åˆ° ghcr.io** â€” æ ‡ç­¾æ ¼å¼ï¼š`sha-xxxxx` + `latest`
3. **è‡ªåŠ¨ SSH éƒ¨ç½²**ï¼ˆå¯é€‰ï¼‰â€” éœ€é…ç½® GitHub Secrets

é•œåƒåœ°å€ï¼š`ghcr.io/remixu1994/fitfuel`

### GitHub é…ç½®

åœ¨ä»“åº“ **Settings â†’ Secrets and variables â†’ Actions** ä¸­é…ç½®ï¼š

#### è‡ªåŠ¨éƒ¨ç½²æ‰€éœ€ Secretsï¼ˆå¯é€‰ï¼‰

| Secret | è¯´æ˜Ž |
|--------|------|
| `DEPLOY_HOST` | æœåŠ¡å™¨ IP æˆ–åŸŸå |
| `DEPLOY_USER` | SSH ç™»å½•ç”¨æˆ· |
| `DEPLOY_SSH_KEY` | SSH ç§é’¥ |
| `DEPLOY_PORT` | SSH ç«¯å£ï¼ˆé»˜è®¤ 22ï¼‰ |

#### è‡ªåŠ¨éƒ¨ç½²æ‰€éœ€ Variables

| Variable | è¯´æ˜Ž |
|----------|------|
| `DEPLOY_ENABLED` | è®¾ä¸º `true` å¼€å¯è‡ªåŠ¨ SSH éƒ¨ç½² |
| `DEPLOY_PATH` | æœåŠ¡å™¨ä¸Šçš„é¡¹ç›®è·¯å¾„ï¼ˆé»˜è®¤ `/opt/fitfuel`ï¼‰ |

> å¦‚æžœä¸é…ç½®è‡ªåŠ¨éƒ¨ç½²ï¼Œæ¯æ¬¡ push ä»…æž„å»ºé•œåƒï¼Œéœ€æ‰‹åŠ¨ pull åˆ°æœåŠ¡å™¨ã€‚

### æœåŠ¡å™¨é¦–æ¬¡éƒ¨ç½²

```bash
# 1. æ‹‰å–é¡¹ç›®
git clone git@github.com:remixu1994/FitFuel.git /opt/fitfuel
cd /opt/fitfuel

# 2. åˆ›å»º .env å¹¶å¡«å…¥ç”Ÿäº§çŽ¯å¢ƒé…ç½®
cp .env.example .env
# ç¼–è¾‘ .env â€”â€” å¡«å…¥æ•°æ®åº“åœ°å€ã€MiMo API Key ç­‰

# 3. ç™»å½• ghcr.ioï¼ˆéœ€ GitHub Personal Access Tokenï¼Œæƒé™ read:packagesï¼‰
echo "YOUR_GITHUB_TOKEN" | docker login ghcr.io -u remixu1994 --password-stdin

# 4. æ‹‰å–å¹¶å¯åŠ¨
docker compose pull app
docker compose up -d app
```

### åŽç»­æ›´æ–°

```bash
cd /opt/fitfuel
docker compose pull app
docker compose up -d --remove-orphans app
docker image prune -f
```

æˆ–ç›´æŽ¥è¿è¡Œéƒ¨ç½²è„šæœ¬ï¼š

```bash
bash tools/scripts/deploy.sh
```

### Docker æž¶æž„è¯´æ˜Ž

```
Dockerfile (å¤šé˜¶æ®µæž„å»º)
â”œâ”€â”€ Stage 1: deps       â€” å®‰è£…ç”Ÿäº§ä¾èµ–
â”œâ”€â”€ Stage 2: builder    â€” prisma generate + next build (standalone æ¨¡å¼)
â””â”€â”€ Stage 3: runner     â€” ä»… copy å¿…éœ€æ–‡ä»¶ï¼Œéž root ç”¨æˆ·è¿è¡Œ
```

- **Base image**: `node:22-alpine`
- **Next.js æ¨¡å¼**: `output: "standalone"`ï¼ˆè‡ªåŒ…å« server.jsï¼‰
- **è¿è¡Œç”¨æˆ·**: `nextjs` (uid 1001)ï¼Œéž root
- **æš´éœ²ç«¯å£**: `3000`

### ç§æœ‰ä¸Šä¼ ç›®å½•ï¼ˆElavatine å›¾ç‰‡ï¼‰

Elavatine ä¸Šä¼ å›¾ç‰‡çš„æ ¹ç›®å½•ç”± `PRIVATE_UPLOAD_DIR` æŽ§åˆ¶ã€‚Docker éƒ¨ç½²ä¸­ï¼Œ
**docker-compose.yml å°†å®¿ä¸»æœºç›®å½•ç›´æŽ¥æŒ‚è½½åˆ°å®¹å™¨**ï¼Œå¹¶è®©åº”ç”¨æŒ‡å‘è¯¥æŒ‚è½½ç‚¹ï¼š

```yaml
environment:
  - PRIVATE_UPLOAD_DIR=/app/uploads
volumes:
  - ./uploads:/app/uploads   # å®¿ä¸»æœºæŒ‡å®šç›®å½• â†’ å®¹å™¨ä¸Šä¼ ç›®å½•
```

- **é»˜è®¤å®¿ä¸»æœºè·¯å¾„**ï¼šcompose æ–‡ä»¶æ—çš„ `./uploads`ï¼ˆå³ `/opt/fitfuel/uploads`ï¼‰ã€‚
  æƒ³ç”¨åˆ«çš„ç›®å½•ï¼Œæ”¹ compose é‡Œçš„æŒ‚è½½è·¯å¾„å³å¯ï¼ˆä¾‹å¦‚ `/data/fitfuel/uploads:/app/uploads`ï¼‰ã€‚
- **æƒé™è¦æ±‚**ï¼šå®¹å™¨å†…ä»¥éž root ç”¨æˆ· `nextjs`ï¼ˆuid 1001ï¼‰è¿è¡Œï¼Œ
**å®¿ä¸»æœºæŒ‚è½½ç›®å½•å¿…é¡»å¯¹è¯¥ uid å¯å†™**ã€‚`tools/scripts/deploy.sh` ä¼šè‡ªåŠ¨ `mkdir -p` å¹¶
  `chown 1001:1001`ï¼›æ‰‹åŠ¨éƒ¨ç½²æ—¶æ‰§è¡Œä¸€æ¬¡ï¼š

```bash
mkdir -p /opt/fitfuel/uploads
sudo chown -R 1001:1001 /opt/fitfuel/uploads
```

- é•œåƒå·²é¢„åˆ›å»º `/app/uploads` å’Œ `/app/.private` å¹¶æŽˆæƒç»™ `nextjs`ï¼Œ
  å› æ­¤å³ä¾¿ä½¿ç”¨å‘½åå·ï¼ˆè€Œéžå®¿ä¸»ç›®å½•æŒ‚è½½ï¼‰ä¹Ÿèƒ½èŽ·å¾—æ­£ç¡®å±žä¸»ã€‚
- è£¸æœºéƒ¨ç½²ï¼ˆéž Dockerï¼‰æ—¶ä¿æŒé»˜è®¤ `PRIVATE_UPLOAD_DIR=.private/elevatine-imports` å³å¯ã€‚

> **å‡çº§è‡ªæ—§ç‰ˆæœ¬**ï¼šæ—§ compose ä½¿ç”¨å‘½åå· `fitfuel_private`ã€‚å‡çº§åŽè¯¥å·ä¸å†ä½¿ç”¨ï¼Œ
> å¦‚éœ€æ¸…ç†ï¼š`docker volume rm fitfuel_private`ï¼ˆå¦‚æœ‰åŽ†å²å›¾ç‰‡è¯·å…ˆè¿ç§»åˆ°æ–°æŒ‚è½½ç›®å½•ï¼‰ã€‚

## çŽ¯å¢ƒå˜é‡

### å¿…éœ€

| å˜é‡ | è¯´æ˜Ž | ç¤ºä¾‹ |
|------|------|------|
| `DATABASE_URL` | PostgreSQL è¿žæŽ¥å­—ç¬¦ä¸² | `postgresql://user:pass@host:port/fitfuel?sslmode=disable` |

æˆ–ä½¿ç”¨åˆ†æ•£é…ç½®ï¼ˆäºŒé€‰ä¸€ï¼‰ï¼š

| å˜é‡ | è¯´æ˜Ž |
|------|------|
| `PGHOST` | æ•°æ®åº“ä¸»æœº |
| `PGPORT` | æ•°æ®åº“ç«¯å£ |
| `PGUSER` | æ•°æ®åº“ç”¨æˆ· |
| `PGPASSWORD` | æ•°æ®åº“å¯†ç  |
| `PGDATABASE` | æ•°æ®åº“åï¼ˆé»˜è®¤ fitfuelï¼‰ |
| `PGSSL` | æ˜¯å¦å¯ç”¨ SSLï¼ˆ"true"/"false"ï¼‰ |

### AI æœåŠ¡ï¼ˆå¿…éœ€ï¼‰

| å˜é‡ | è¯´æ˜Ž |
|------|------|
| `MIMO_BASE_URL` | MiMo API åŸºç¡€ URL |
| `MIMO_API_KEY` | MiMo API å¯†é’¥ |
| `MIMO_MODEL` | æ–‡æœ¬æ¨¡åž‹åç§°ï¼ˆå¦‚ mimo-v2.5ï¼‰ |
| `MIMO_VISION_MODEL` | è§†è§‰æ¨¡åž‹åç§°ï¼ˆå¯é€‰ï¼Œå›žé€€åˆ° MIMO_MODELï¼‰ |
| `AI_CANDIDATE_SECRET` | AI å€™é€‰ HMAC ç­¾åå¯†é’¥ï¼ˆâ‰¥32 å­—ç¬¦ï¼‰ |

### COROS è¿åŠ¨åŒæ­¥ï¼ˆå¯é€‰ï¼‰

| å˜é‡ | è¯´æ˜Ž |
|------|------|
| `COROS_ACCOUNT` | COROS è´¦å· |
| `COROS_PASSWORD` | COROS å¯†ç  |
| `COROS_API_BASE_URL` | COROS API åœ°å€ï¼ˆé»˜è®¤ https://teamcnapi.coros.comï¼‰ |
| `COROS_TEAM_API_BASE_URL` | COROS Team API åœ°å€ |

### å…¶ä»–ï¼ˆå¯é€‰ï¼‰

| å˜é‡ | è¯´æ˜Ž | é»˜è®¤å€¼ |
|------|------|--------|
| `PRIVATE_UPLOAD_DIR` | å›¾ç‰‡ä¸Šä¼ æ ¹ç›®å½• | `.private/elevatine-imports` |
| `COOKIE_SECURE` | Cookie å®‰å…¨æ ‡å¿— | ç”Ÿäº§çŽ¯å¢ƒ trueï¼Œå¼€å‘çŽ¯å¢ƒ false |

## æ•°æ®åº“åˆå§‹åŒ–

### å…¨æ–°éƒ¨ç½²

```bash
# 1. åˆ›å»ºæ•°æ®åº“
npm run db:init

# 2. éªŒè¯ç»“æž„
npm run db:verify

# 3. æ£€æŸ¥è¿žæŽ¥
npm run db:inspect
```

### ä»Žæ—§åº“è¿ç§»

```bash
# ä»Ž food_db è¿ç§»åˆ°ç‹¬ç«‹ fitfuel æ•°æ®åº“
npm run db:migrate:fitfuel

# éªŒè¯ç›®æ ‡åº“
npm run db:verify:fitfuel
```

### Prisma å®¢æˆ·ç«¯

```bash
npm run prisma:generate    # ç”Ÿæˆ Prisma Client
npm run prisma:pull        # ä»Žæ•°æ®åº“åå‘ç”Ÿæˆ schemaï¼ˆæ…Žç”¨ï¼‰
```

> **æ³¨æ„**ï¼š`postinstall` å’Œ `prebuild` è„šæœ¬ä¼šè‡ªåŠ¨æ‰§è¡Œ `prisma generate`ï¼Œæ— éœ€æ‰‹åŠ¨è¿è¡Œã€‚

## æœ¬åœ°å¼€å‘

```bash
# å®‰è£…ä¾èµ–
npm install

# å¯åŠ¨å¼€å‘æœåŠ¡å™¨ï¼ˆhttp://localhost:3000ï¼‰
npm run dev
```

å¼€å‘æœåŠ¡å™¨æ”¯æŒçƒ­é‡è½½ã€‚Prisma Client åœ¨å¼€å‘çŽ¯å¢ƒä¸‹ä½¿ç”¨å…¨å±€å•ä¾‹ï¼Œé˜²æ­¢çƒ­é‡è½½å¯¼è‡´è¿žæŽ¥æ³„æ¼ã€‚

## ç”Ÿäº§æž„å»º

```bash
# æž„å»ºå‰ç¡®ä¿åœæ­¢å ç”¨ 3000 ç«¯å£çš„æœåŠ¡ï¼ˆé¿å… Prisma å¼•æ“Žæ–‡ä»¶é”ï¼‰
# ç„¶åŽæž„å»º
npm run build

# å¯åŠ¨ç”Ÿäº§æœåŠ¡å™¨
npm run start
```

æž„å»ºæµç¨‹ï¼š
1. `prebuild` â†’ `prisma generate`
2. `next build` â†’ TypeScript ç±»åž‹æ£€æŸ¥ + ç¼–è¯‘
3. è¾“å‡ºè‡³ `.next/` ç›®å½•

### å¸¸è§æž„å»ºé—®é¢˜

| é—®é¢˜ | åŽŸå›  | è§£å†³ |
|------|------|------|
| Prisma å¼•æ“Žæ–‡ä»¶é” | 3000 ç«¯å£æœ‰è¿è¡Œä¸­çš„ Next æœåŠ¡ | å…ˆåœæ­¢æœåŠ¡å†æž„å»º |
| `rowCount` å¯ç©ºé”™è¯¯ | Prisma Raw è¿”å›žç±»åž‹ä¸Ž pg ä¸åŒ | æ˜¾å¼å½’é›¶å¤„ç† |
| JSON å‚æ•°ç»‘å®šé”™è¯¯ | Prisma å°† JSON å­—ç¬¦ä¸²ç»‘å®šä¸º text | SQL ä¸­æ˜¾å¼ `::jsonb` è½¬æ¢ |
| advisory lock è¿”å›ž void | Prisma æ— æ³•ååºåˆ—åŒ– void | æ˜¾å¼è½¬æ¢ä¸º `::text` |
| æ—¥æœŸå‚æ•°ä¸éšå¼è½¬æ¢ | Prisma ä¸è‡ªåŠ¨å°†å­—ç¬¦ä¸²è½¬ date | SQL ä¸­æ˜¾å¼ `::date` |

## æµ‹è¯•

### ç«¯åˆ°ç«¯å†’çƒŸæµ‹è¯•

```bash
# è¿è¡Œå®Œæ•´å†’çƒŸæµ‹è¯•
npm run test:smoke

# æ¸…ç†æµ‹è¯•æ•°æ®
npm run test:smoke:cleanup
```

å†’çƒŸæµ‹è¯•è¦†ç›–ï¼š
- è®¤è¯ä¸Žæƒé™ï¼ˆç™»å½•ã€æ”¹å¯†ã€ç®¡ç†å‘˜ã€ç”¨æˆ·éš”ç¦»ï¼‰
- é£Ÿå“æœç´¢ï¼ˆç©ºæœç´¢ã€å…³é”®è¯æœç´¢ã€ç²¾ç¡®åŒ¹é…ï¼‰
- æ¯æ—¥è®°å½•è¯»å†™
- é¤é£Ÿäº‹åŠ¡
- AI å…±äº«å…¥åº“ï¼ˆçœŸå®ž MiMo è°ƒç”¨ï¼‰
- Excel/CSV å¯¼å…¥å¯¼å‡º
- Elavatine å›¾ç‰‡åŒæ­¥
- æ’¤é”€æ¢å¤

### Elavatine è§†è§‰æµ‹è¯•

```bash
node --env-file=.env.local tools/scripts/elevatine-vision-smoke.mjs
```

æœ¬åœ°è„šæœ¬é€šè¿‡æ ‡å‡†è¾“å‡ºè¿”å›žç»“æžœï¼›éœ€è¦ä¿å­˜æ—¥å¿—æ—¶ç»Ÿä¸€å†™å…¥ `.runtime/logs/`ï¼Œä¾‹å¦‚ï¼š

```bash
mkdir -p .runtime/logs
npm run coros:sync > .runtime/logs/coros-sync.log 2>&1
```

### COROS åŒæ­¥æµ‹è¯•

```bash
npm run coros:login:test    # æµ‹è¯•ç™»å½•
npm run coros:sync          # æ‰§è¡ŒåŒæ­¥
npm run coros:sync:verify   # éªŒè¯åŒæ­¥ç»“æžœ
```

## è„šæœ¬å·¥å…·

| å‘½ä»¤ | è¯´æ˜Ž |
|------|------|
| `npm run db:init` | åˆ›å»ºæ•°æ®åº“å¹¶æ‰§è¡Œè¿ç§» |
| `npm run db:inspect` | æ£€æŸ¥æ•°æ®åº“è¿žæŽ¥å’Œè¡¨çŠ¶æ€ |
| `npm run db:verify` | éªŒè¯æ•°æ®åº“ç»“æž„å®Œæ•´æ€§ |
| `npm run db:migrate:fitfuel` | ä»Žæ—§åº“è¿ç§»åˆ°ç‹¬ç«‹ fitfuel æ•°æ®åº“ |
| `npm run db:verify:fitfuel` | éªŒè¯ç›®æ ‡è¿ç§»åº“ |
| `npm run prisma:generate` | ç”Ÿæˆ Prisma Client |
| `npm run prisma:pull` | åå‘ç”Ÿæˆ Prisma Schema |
| `npm run data:enrich:elevatine` | æ‰¹é‡è¡¥å…¨ Elavatine é£Ÿå“è¥å…» |
| `npm run coros:login:test` | æµ‹è¯• COROS ç™»å½• |
| `npm run coros:sync` | æ‰§è¡Œ COROS æ´»åŠ¨åŒæ­¥ |
| `npm run coros:sync:verify` | éªŒè¯ COROS åŒæ­¥ç»“æžœ |
| `npm run test:smoke` | ç«¯åˆ°ç«¯å†’çƒŸæµ‹è¯• |
| `npm run test:smoke:cleanup` | æ¸…ç†å†’çƒŸæµ‹è¯•æ•°æ® |

## é¡¹ç›®è„šæœ¬æ–‡ä»¶

```
scripts/
â”œâ”€â”€ inspect-db.mjs              # æ•°æ®åº“æ£€æŸ¥
â”œâ”€â”€ init-db.mjs                 # æ•°æ®åº“åˆå§‹åŒ–
â”œâ”€â”€ migrate-to-fitfuel.mjs      # æ—§åº“è¿ç§»
â”œâ”€â”€ verify-db.mjs               # æ•°æ®åº“éªŒè¯
â”œâ”€â”€ verify-target-db.mjs        # ç›®æ ‡åº“éªŒè¯
â”œâ”€â”€ prisma-client.mjs           # Prisma Client å·¥å…·
â”œâ”€â”€ smoke-test.mjs              # å†’çƒŸæµ‹è¯•
â”œâ”€â”€ cleanup-smoke-data.mjs      # æµ‹è¯•æ•°æ®æ¸…ç†
â”œâ”€â”€ verify-latest-import.mjs    # å¯¼å…¥éªŒè¯
â”œâ”€â”€ elevatine-vision-smoke.mjs  # Elavatine è§†è§‰æµ‹è¯•
â”œâ”€â”€ import-elevatine-folder.ts  # æ‰¹é‡å¯¼å…¥ Elavatine æˆªå›¾
â”œâ”€â”€ verify-elevatine-import.ts  # Elavatine å¯¼å…¥éªŒè¯
â”œâ”€â”€ enrich-elevatine-foods.ts   # Elavatine é£Ÿå“è¥å…»è¡¥å…¨
â”œâ”€â”€ test-coros-login.ts         # COROS ç™»å½•æµ‹è¯•
â”œâ”€â”€ sync-coros-activities.ts    # COROS æ´»åŠ¨åŒæ­¥
â””â”€â”€ verify-coros-sync.ts        # COROS åŒæ­¥éªŒè¯
```

## å®‰å…¨æ³¨æ„äº‹é¡¹

1. **`.env.local` å¿…é¡»è¢« Git å¿½ç•¥** â€” æ•°æ®åº“å¯†ç å’Œ AI å¯†é’¥ä¸å¾—æäº¤
2. **`AI_CANDIDATE_SECRET` è‡³å°‘ 32 å­—ç¬¦** â€” ç”¨äºŽ HMAC ç­¾åï¼Œé˜²æ­¢ AI å€™é€‰ç¯¡æ”¹
3. **ç®¡ç†å‘˜è´¦å·ç®¡ç†** â€” å…¬å¼€æ³¨å†Œå·²å…³é—­ï¼Œä»…ç®¡ç†å‘˜å¯åˆ›å»ºç”¨æˆ·
4. **å›¾ç‰‡å­˜å‚¨ä¸ºç§æœ‰ç›®å½•** â€” `PRIVATE_UPLOAD_DIR` ä¸åœ¨å…¬å…±è®¿é—®è·¯å¾„ä¸‹
5. **COROS å‡­æ®å®‰å…¨** â€” ä½¿ç”¨ bcrypt(md5(password)) æ ¼å¼æäº¤ï¼Œä¸å­˜å‚¨æ˜Žæ–‡
6. **ä¼šè¯ token ä»…å­˜å“ˆå¸Œ** â€” å³ä½¿æ•°æ®åº“æ³„éœ²ä¹Ÿæ— æ³•ç›´æŽ¥ä½¿ç”¨ token

## è¿ç»´

### å›¾ç‰‡æ¸…ç†

Elavatine å›¾ç‰‡åœ¨æ‰¹æ¬¡æäº¤åŽè‡ªåŠ¨åˆ é™¤ã€‚æœªæäº¤çš„æ‰¹æ¬¡å›¾ç‰‡åœ¨ 24 å°æ—¶åŽè¿‡æœŸï¼Œå¯é€šè¿‡ `cleanupExpiredElevatineImages()` æ¸…ç†ã€‚

### æ•°æ®åº“ç»´æŠ¤

```bash
# å®šæœŸæ‰§è¡Œï¼ˆå»ºè®®æ¯å‘¨ï¼‰
npm run db:verify    # éªŒè¯ç»“æž„å®Œæ•´æ€§
npm run db:inspect   # æ£€æŸ¥è¡¨çŠ¶æ€
```

### æ—¥å¿—

- MiMo AI è¯·æ±‚å¤±è´¥ï¼š`console.error("Mimo request failed", error)`
- Elavatine è¥å…»ä¼°ç®—å¤±è´¥ï¼š`console.error("Elavatine nutrition estimate failed", ...)`
- æœªå¤„ç†é”™è¯¯ï¼š`console.error(error)` in `jsonError()`

