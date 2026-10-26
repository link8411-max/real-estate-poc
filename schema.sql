-- 1. 지역 정보 테이블
CREATE TABLE regions (
    code VARCHAR(5) PRIMARY KEY,     -- 법정동 시군구 코드 (e.g., 11680)
    city_name VARCHAR(20) NOT NULL,  -- 서울특별시, 경기도 등
    district_name VARCHAR(20) NOT NULL -- 강남구, 용인시 등
);

-- 2. 아파트 기본 정보 테이블
CREATE TABLE apartments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name VARCHAR(100) NOT NULL,
    lawd_cd VARCHAR(5) NOT NULL,
    dong VARCHAR(50),
    jibun VARCHAR(20),
    build_year INT,
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    UNIQUE(name, lawd_cd, dong, jibun)
);

-- 3. 실거래 데이터 테이블
CREATE TABLE transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    apt_id INT REFERENCES apartments(id),
    amount BIGINT NOT NULL,          -- 거래금액 (원 단위)
    area DECIMAL(10, 4) NOT NULL,    -- 전용면적
    floor INT,                       -- 층
    deal_date DATE NOT NULL,         -- 거래일자 (년, 월, 일 합산)
    unique_hash VARCHAR(64) UNIQUE,  -- 중복 방지용 해시 (아파트+층+면적+날짜+금액)
    is_canceled BOOLEAN DEFAULT FALSE, -- 해제사유발생 여부
    cancel_date DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 4. 분석 인사이트 테이블
CREATE TABLE transaction_insights (
    transaction_id INT PRIMARY KEY REFERENCES transactions(id),
    peak_drop_pct INT,               -- 전고점 대비 하락폭
    gap_ratio INT,                   -- 전세가율
    is_new_high BOOLEAN,             -- 신고가 여부
    summary_text TEXT                -- 룰 기반 자동 생성 한줄평
);

-- 5. 인덱스 최적화
CREATE INDEX idx_trans_deal_date ON transactions(deal_date DESC);
CREATE INDEX idx_trans_apt_id ON transactions(apt_id);
CREATE INDEX idx_apt_lawd_cd ON apartments(lawd_cd);

-- 6. FTS5 풀텍스트 검색 (trigram 토크나이저로 한글 부분 문자열 검색 지원)
CREATE VIRTUAL TABLE apartments_fts USING fts5(
    name,
    dong,
    content='apartments',
    content_rowid='id',
    tokenize='trigram'
);

-- FTS 인덱스 초기 데이터 삽입 (테이블 생성 후 실행)
-- INSERT INTO apartments_fts(rowid, name, dong) SELECT id, name, dong FROM apartments;

-- ============================================================
-- 1단계 재구축 추가분 (pipeline/db.py migrate()가 멱등으로 적용)
-- ============================================================
-- regions.succeeded_by TEXT  : 폐지 코드의 후속 코드들을 쉼표로 연결 ("28275,28290"). 83개 + 폐지 5개 = 88행
-- apartments.apt_seq TEXT    : 국토부 단지 일련번호 (매칭 1순위)
-- apartments.household_count INT
CREATE UNIQUE INDEX IF NOT EXISTS idx_apt_seq ON apartments(apt_seq) WHERE apt_seq IS NOT NULL;

CREATE TABLE IF NOT EXISTS rents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    apt_id INT REFERENCES apartments(id),
    deposit INT NOT NULL,            -- 보증금(만원)
    monthly_rent INT NOT NULL,       -- 월세(만원), 전세는 0
    area REAL NOT NULL,
    floor INT,
    deal_date TEXT NOT NULL,
    contract_type TEXT,
    contract_term TEXT,
    use_rr_right INT,
    pre_deposit INT,
    pre_monthly_rent INT,
    unique_hash TEXT UNIQUE,         -- md5("R|이름|층|면적|일자|보증금|월세")
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS apartment_aliases (
    old_id INTEGER PRIMARY KEY,
    canonical_id INT NOT NULL
);

-- 이번 수집으로 바뀐 단지 (인사이트 재계산 대상). pop_changed()가 읽고 비운다.
CREATE TABLE IF NOT EXISTS changed_apartments (
    apt_id INTEGER PRIMARY KEY,
    changed_at TEXT
);
