
## Basics- the BEP Tables

First create the database:
```
sudo -u my_name createdb bayarea_event_publisher
```
In my case my_name is 'kevinmunroe'. Next, login to PostgreSQL: 
```
psql -U my_name -d bayarea_event_publisher 
```

Here we create 3 main tables- `user`, `events` and `published_events`. `user` contains basic user information, `events` contains the canonical event to be published to *n* platforms, and `published_events` tracks the events as remixed and published to a platform, with some state data. 
There's a lookup table `platforms`, which contains the supported platform name, url to form, and TBD formulas for converting canonical event to platform-specific event.

All the tables use `uuid_generate_v4` so first turn on `uuid-ossp` in PostgreSQL:
``` 
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
```

Create `users`: 
```
CREATE TABLE users (
  user_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  first_name TEXT,
  last_name TEXT,
  company TEXT,

  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,

  created_at TIMESTAMP DEFAULT NOW()
);
```
Create `events`:
```
CREATE TABLE events (
  event_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,

  name TEXT NOT NULL,
  email TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,

  start_datetime TIMESTAMP NOT NULL,
  end_datetime TIMESTAMP,

  location_name TEXT,
  address TEXT,

  price TEXT,
  image_url TEXT,

  tags TEXT[],

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```
also create index on `events` by `user_id`, will be used heavily in UI:
```
CREATE INDEX idx_events_user_id ON events(user_id);
```

Create `published_events`, tracks status of events as they are published on platforms:
```
CREATE TABLE published_events (
  published_event_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  event_id UUID NOT NULL REFERENCES events(event_id) ON DELETE CASCADE,

  platform TEXT NOT NULL,

  status TEXT NOT NULL DEFAULT 'not_started',
  -- allowed: not_started, in_progress, submitted

  external_url TEXT,

  date_published TIMESTAMP,

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  UNIQUE (event_id, platform)
);
```

Some indexes on `published_events`:
```
CREATE INDEX idx_published_events_event_id 
ON published_events(event_id);

CREATE INDEX idx_published_events_status 
ON published_events(status);
```

Finally some constraints on event status: 
```
ALTER TABLE published_events
ADD CONSTRAINT status_check
CHECK (status IN ('not_started', 'in_progress', 'submitted'));
```

You should end up with tables like this:
```
bayarea_event_publisher=# \d
                List of relations
 Schema |       Name       | Type  |    Owner    
--------+------------------+-------+-------------
 public | events           | table | kevinmunroe
 public | published_events | table | kevinmunroe
 public | users            | table | kevinmunroe
(3 rows)
```
and indexes like this:
```
bayarea_event_publisher=# \di
                                     List of indexes
 Schema |                  Name                  | Type  |    Owner    |      Table       
--------+----------------------------------------+-------+-------------+------------------
 public | events_pkey                            | index | kevinmunroe | events
 public | idx_events_user_id                     | index | kevinmunroe | events
 public | idx_published_events_event_id          | index | kevinmunroe | published_events
 public | idx_published_events_status            | index | kevinmunroe | published_events
 public | published_events_event_id_platform_key | index | kevinmunroe | published_events
 public | published_events_pkey                  | index | kevinmunroe | published_events
 public | users_email_key                        | index | kevinmunroe | users
 public | users_pkey                             | index | kevinmunroe | users
(8 rows)
```
