# Lessum

카드 명세서 메일을 알아서 긁어와 정리해주는 가계부입니다.

카드를 여러 장 쓰다 보면 명세서가 카드사마다 다른 형식으로 날아오고, 매번 내려받아서 엑셀에 옮겨 적게 됩니다. 그러다 이용금액과 청구금액을 섞거나 카드대금 납부를 지출로 또 세면 월별 비교가 틀어지죠. Lessum은 이 과정을 대신합니다. 네이버 메일함에 연결해두면 명세서 메일이 도착할 때마다 첨부를 해제하고 날짜·이용처·금액을 추출해서 가계부 후보로 쌓아줍니다. 사용자는 확인이 필요한 항목이랑 수기 거래만 챙기면 됩니다.

월급이나 월세, 구독 같은 반복 거래는 정기 거래로 등록해두면 예정과 실제 내역을 연결해서 누락 여부를 알려주고, 대시보드에서 월별 수입·지출과 카테고리별 증감을 볼 수 있습니다.

## 지금 되는 것

- 네이버 메일 IMAP 연결 (앱 비밀번호 방식, 읽기 전용이라 메일을 읽음 처리하거나 지우지 않음)
- 삼성 / 롯데 / 현대 / 우리카드 명세서 수집·파싱 — 실제 명세서로 검증 완료
- 암호화 첨부 해제 후 문서 합계와 대조해서 검증. 금액이나 연도가 애매한 행은 자동 확정하지 않고 확인 목록으로 보냄
- `.eml` / HTML 첨부 수동 업로드
- 수입, 계좌이체 지출 수기 입력
- 할부는 구매일에 전체 금액 한 번만 반영, 취소·환불은 원구매에 연결해서 차감
- 카드대금 납부나 내 계좌 간 이동은 정산으로 빼서 지출에 이중으로 안 잡히게 처리

신한카드, 은행 연동, Gmail/Outlook, OCR, 공동 가계부 같은 건 아직 없습니다. 자세한 범위와 정책은 상위 폴더의 `PRD-money-book.md` 참고.

## 구성

```
lessum-backend/    Express + TypeScript. 메일 연결, 수집, 거래 API
lessum-frontend/   Next.js (App Router) + Tailwind + shadcn/ui
```

데이터는 Supabase(Auth / Postgres / Storage)에 저장하고, 사용자 간 격리는 RLS로 처리합니다. 메일 수집은 imapflow + mailparser, 명세서 파싱은 cheerio와 exceljs를 씁니다.

## 실행

백엔드:

```bash
cd lessum-backend
cp .env.example .env   # Supabase 키 등 채우기
npm install
npm run dev            # localhost:4000
```

프론트엔드:

```bash
cd lessum-frontend
npm install
npm run dev            # localhost:3001
```
