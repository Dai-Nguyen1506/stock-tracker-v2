import time
import logging
from cassandra.cluster import Cluster
import psycopg2
from app.config import settings

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

cassandra_cluster = None
cassandra_session = None
postgres_conn = None

def init_cassandra():
    global cassandra_session, cassandra_cluster
    retries = 20
    delay = 5
    cluster = None
    session = None
    
    for i in range(retries):
        try:
            logger.info(f"Connecting to Cassandra at {settings.CASSANDRA_HOST}:{settings.CASSANDRA_PORT} (attempt {i+1}/{retries})...")
            cluster = Cluster([settings.CASSANDRA_HOST], port=settings.CASSANDRA_PORT)
            session = cluster.connect()
            logger.info("Cassandra connected successfully!")
            break
        except Exception as e:
            logger.warning(f"Cassandra not ready yet: {e}")
            if cluster:
                try:
                    cluster.shutdown()
                except Exception:
                    pass
            time.sleep(delay)
    else:
        raise Exception("Could not connect to Cassandra after multiple retries.")

    cassandra_cluster = cluster
    cassandra_session = session

    # Initialize keyspace
    session.execute(f"""
        CREATE KEYSPACE IF NOT EXISTS {settings.CASSANDRA_KEYSPACE}
        WITH replication = {{'class': 'SimpleStrategy', 'replication_factor': 1}};
    """)
    session.set_keyspace(settings.CASSANDRA_KEYSPACE)

    # Initialize table with TWCS (TimeWindowCompactionStrategy)
    session.execute("""
        CREATE TABLE IF NOT EXISTS market_data (
            symbol text,
            bucket_date text,
            timestamp timestamp,
            open double,
            high double,
            low double,
            close double,
            volume double,
            event_type text,
            PRIMARY KEY ((symbol, bucket_date), timestamp)
        ) WITH CLUSTERING ORDER BY (timestamp DESC)
        AND compaction = {
            'class': 'TimeWindowCompactionStrategy',
            'compaction_window_unit': 'DAYS',
            'compaction_window_size': 1
        };
    """)
    logger.info("Cassandra database schema initialized.")

def init_postgres():
    global postgres_conn
    retries = 10
    delay = 3
    conn = None
    
    for i in range(retries):
        try:
            logger.info(f"Connecting to PostgreSQL at {settings.POSTGRES_HOST}:{settings.POSTGRES_PORT} (attempt {i+1}/{retries})...")
            conn = psycopg2.connect(
                host=settings.POSTGRES_HOST,
                port=settings.POSTGRES_PORT,
                database=settings.POSTGRES_DB,
                user=settings.POSTGRES_USER,
                password=settings.POSTGRES_PASSWORD
            )
            logger.info("PostgreSQL connected successfully!")
            break
        except Exception as e:
            logger.warning(f"PostgreSQL not ready yet: {e}")
            time.sleep(delay)
    else:
        raise Exception("Could not connect to PostgreSQL after multiple retries.")

    postgres_conn = conn

    # Initialize table
    with conn.cursor() as cur:
        cur.execute("""
            CREATE TABLE IF NOT EXISTS watchlist (
                id SERIAL PRIMARY KEY,
                symbol VARCHAR(20) UNIQUE NOT NULL,
                added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        """)
        conn.commit()
    logger.info("PostgreSQL database schema initialized.")

def get_cassandra_session():
    global cassandra_session
    if cassandra_session is None:
        init_cassandra()
    return cassandra_session

def get_postgres_conn():
    global postgres_conn
    if postgres_conn is None or postgres_conn.closed:
        init_postgres()
    return postgres_conn

def close_dbs():
    global cassandra_cluster, cassandra_session, postgres_conn
    logger.info("Closing database connections...")
    if cassandra_session:
        try:
            cassandra_session.shutdown()
        except Exception:
            pass
    if cassandra_cluster:
        try:
            cassandra_cluster.shutdown()
        except Exception:
            pass
    if postgres_conn and not postgres_conn.closed:
        try:
            postgres_conn.close()
        except Exception:
            pass
