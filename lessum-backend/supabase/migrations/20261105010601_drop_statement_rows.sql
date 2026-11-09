-- 거래 데이터가 transactions로 이관 완료되어 statement_rows 제거
-- (statements는 메일 단위 중복 방지 장부로 유지)
drop table public.statement_rows;
