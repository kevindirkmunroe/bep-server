process.env.NODE_ENV = "development";
process.env.SESSION_SECRET = "integration-test-secret";
process.env.FRONTEND_URL = "http://localhost:3000";

require("ts-node/register");

const assert = require("node:assert/strict");
const { PassThrough, Readable, Writable } = require("node:stream");
const { after, beforeEach, describe, it } = require("node:test");
const Module = require("node:module");
const bcrypt = require("bcrypt");

const mockPool = {
    queryCalls: [],
    connectCalls: [],
    queryHandler: async () => ({ rows: [], rowCount: 0 }),
    connectHandler: async () => createMockClient(),
    async query(sql, params) {
        this.queryCalls.push({ sql, params });
        return this.queryHandler(sql, params);
    },
    async connect() {
        const client = await this.connectHandler();
        this.connectCalls.push(client);
        return client;
    },
    reset() {
        this.queryCalls = [];
        this.connectCalls = [];
        this.queryHandler = async () => ({ rows: [], rowCount: 0 });
        this.connectHandler = async () => createMockClient();
    }
};

const mailer = {
    sends: [],
    async send(to, subject, html) {
        this.sends.push({ to, subject, html });
    },
    reset() {
        this.sends = [];
    }
};

function createMockClient(queryHandler = async () => ({ rows: [], rowCount: 0 })) {
    return {
        queryCalls: [],
        released: false,
        async query(sql, params) {
            this.queryCalls.push({ sql, params });
            return queryHandler(sql, params);
        },
        release() {
            this.released = true;
        }
    };
}

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
    const parentFilename = parent && parent.filename;

    if (parentFilename && parentFilename.endsWith("/src/controllers/usersController.ts") && request === "../db") {
        return { __esModule: true, default: mockPool };
    }

    if (parentFilename && parentFilename.endsWith("/src/controllers/eventsController.ts") && request === "../db") {
        return { __esModule: true, default: mockPool };
    }

    if (parentFilename && parentFilename.endsWith("/src/controllers/publishedEventsController.ts") && request === "../db") {
        return { __esModule: true, default: mockPool };
    }

    if (parentFilename && parentFilename.endsWith("/src/controllers/mappingController.ts") && request === "../db") {
        return { __esModule: true, default: mockPool };
    }

    if (parentFilename && parentFilename.endsWith("/src/controllers/usersController.ts") && request === "../mailers/MailProvider") {
        return {
            MailProvider: {
                getMailer: () => mailer
            }
        };
    }

    return originalLoad.apply(this, arguments);
};

const app = require("../../src/app").default;

async function request(method, url, { body, headers = {} } = {}) {
    const chunks = [];
    const requestBody = body === undefined ? "" : JSON.stringify(body);
    const req = new Readable({
        read() {
            this.push(requestBody);
            this.push(null);
        }
    });
    const res = new Writable();
    const responseHeaders = {};

    req.method = method;
    req.url = url;
    req.headers = {
        host: "127.0.0.1",
        "content-length": Buffer.byteLength(requestBody),
        ...headers
    };
    const socket = new PassThrough();
    socket.encrypted = false;
    socket.remoteAddress = "127.0.0.1";
    req.connection = socket;
    req.socket = socket;

    res.statusCode = 200;
    res.write = (chunk) => {
        if (chunk) {
            chunks.push(Buffer.from(chunk));
        }
        return true;
    };
    res.setHeader = (name, value) => {
        responseHeaders[name.toLowerCase()] = value;
    };
    res.getHeader = (name) => responseHeaders[name.toLowerCase()];
    res.getHeaders = () => responseHeaders;
    res.removeHeader = (name) => {
        delete responseHeaders[name.toLowerCase()];
    };
    res.writeHead = (statusCode, headersToSet = {}) => {
        res.statusCode = statusCode;
        for (const [name, value] of Object.entries(headersToSet)) {
            res.setHeader(name, value);
        }
    };

    const finished = new Promise((resolve, reject) => {
        res.end = (chunk) => {
            if (chunk) {
                chunks.push(Buffer.from(chunk));
            }
            const text = Buffer.concat(chunks).toString("utf8");
            resolve({
                status: res.statusCode,
                headers: responseHeaders,
                text,
                json: () => JSON.parse(text)
            });
        };

        app.handle(req, res, reject);
    });

    return finished;
}

describe("app integration", () => {
    after(() => {
        Module._load = originalLoad;
    });

    beforeEach(() => {
        mockPool.reset();
        mailer.reset();
    });

    it("rejects protected routes without a session", async () => {
        const response = await request("GET", "/users/user-1");

        assert.equal(response.status, 401);
        assert.deepEqual(response.json(), { error: "Unauthorized" });
        assert.equal(mockPool.queryCalls.length, 0);
    });

    it("persists a login session and returns it from /users/me", async () => {
        const passwordHash = await bcrypt.hash("correct horse", 10);

        mockPool.queryHandler = async (sql, params) => {
            if (sql.includes("FROM users WHERE username = $1")) {
                assert.deepEqual(params, ["kevin"]);
                return {
                    rows: [{
                        user_id: "user-1",
                        username: "kevin",
                        first_name: "Kevin",
                        company: "BEP",
                        password_hash: passwordHash
                    }]
                };
            }

            if (sql.includes("INSERT INTO user_logins")) {
                assert.deepEqual(params, ["user-1"]);
                return { rows: [], rowCount: 1 };
            }

            throw new Error(`Unexpected query: ${sql}`);
        };

        const loginResponse = await request("POST", "/users/login", {
            headers: { "content-type": "application/json" },
            body: { username: "kevin", password: "correct horse" }
        });
        const cookie = [].concat(loginResponse.headers["set-cookie"])[0];

        assert.equal(loginResponse.status, 200);
        assert.deepEqual(loginResponse.json(), {
            userId: "user-1",
            firstName: "Kevin",
            company: "BEP"
        });
        assert.match(String(cookie), /connect\.sid=/);

        const meResponse = await request("GET", "/users/me", {
            headers: { cookie }
        });

        assert.equal(meResponse.status, 200);
        assert.deepEqual(meResponse.json(), {
            userId: "user-1",
            username: "kevin",
            firstName: "Kevin",
            company: "BEP"
        });
    });

    it("creates an event and initializes all platform publication rows", async () => {
        const passwordHash = await bcrypt.hash("correct horse", 10);

        mockPool.queryHandler = async (sql) => {
            if (sql.includes("FROM users WHERE username = $1")) {
                return {
                    rows: [{
                        user_id: "user-1",
                        username: "kevin",
                        first_name: "Kevin",
                        company: "BEP",
                        password_hash: passwordHash
                    }]
                };
            }

            if (sql.includes("INSERT INTO user_logins")) {
                return { rows: [], rowCount: 1 };
            }

            throw new Error(`Unexpected pool query: ${sql}`);
        };

        const client = createMockClient(async (sql, params) => {
            if (sql === "BEGIN" || sql === "COMMIT") {
                return { rows: [], rowCount: null };
            }

            if (sql.includes("INSERT INTO events")) {
                assert.equal(params[0], "user-1");
                assert.equal(params[1], "Night Market");
                return { rows: [{ event_id: "event-1" }], rowCount: 1 };
            }

            if (sql.includes("INSERT INTO published_events")) {
                return { rows: [], rowCount: 1 };
            }

            throw new Error(`Unexpected client query: ${sql}`);
        });
        mockPool.connectHandler = async () => client;

        const loginResponse = await request("POST", "/users/login", {
            headers: { "content-type": "application/json" },
            body: { username: "kevin", password: "correct horse" }
        });
        const cookie = [].concat(loginResponse.headers["set-cookie"])[0];

        const response = await request("POST", "/users/user-1/events", {
            headers: {
                "content-type": "application/json",
                cookie
            },
            body: {
                title: "Night Market",
                description: "Food and music",
                start_datetime: "2026-07-01T19:00:00.000Z",
                end_datetime: "2026-07-01T22:00:00.000Z",
                location_name: "The Plaza",
                address: "1 Main St",
                price: "Free",
                image_url: "https://example.com/image.jpg",
                tags: ["food"],
                name: "Kevin",
                email: "kevin@example.com",
                zip: "94612",
                category: "community"
            }
        });

        assert.equal(response.status, 201);
        assert.deepEqual(response.json(), { event_id: "event-1" });
        assert.equal(client.released, true);
        assert.equal(client.queryCalls[0].sql, "BEGIN");
        assert.equal(client.queryCalls.at(-1).sql, "COMMIT");

        const platformInserts = client.queryCalls.filter((call) => call.sql.includes("INSERT INTO published_events"));
        assert.deepEqual(
            platformInserts.map((call) => call.params),
            [
                ["event-1", "funcheapsf"],
                ["event-1", "visitoakland"],
                ["event-1", "sfstation"],
                ["event-1", "indybay"]
            ]
        );
    });
});
