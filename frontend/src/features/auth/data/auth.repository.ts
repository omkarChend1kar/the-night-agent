import { API_BASE_URL, HttpClient } from "../../../core/http/api-client";

export class AuthDataSource extends HttpClient {
    constructor() {
        super(API_BASE_URL);
    }

    async login(email: string, password: string): Promise<{ access_token: string; user: any }> {
        // Correct path as per Login page which used http://localhost:3000/auth/login directly
        // BaseClient uses /api suffix by default 'http://localhost:3001/api'.
        // Original code: 'http://localhost:3000/auth/login' -> This suggests auth is on a different route or port or base path?
        // Let's assume Backend runs on 3000 or 3001?
        // The original Make file might show backend port. API_BASE_URL was set to 3001/api in step 1.
        // Original login page used 3000. This is a discrepancy. 
        // I will use `http://localhost:3000/auth/login` absolute URL to match original functionality for now.

        // Actually I can override the call to use full url.
        return this.instance.post('http://localhost:3000/auth/login', { email, password }).then(res => res.data);
    }

    async signup(email: string, password: string, name: string): Promise<void> {
        return this.instance.post('http://localhost:3000/auth/signup', { email, password, name }).then(res => res.data);
    }
}

export class AuthRepositoryImpl {
    constructor(private dataSource: AuthDataSource) { }

    async login(email: string, password: string) {
        return this.dataSource.login(email, password);
    }

    async signup(email: string, password: string, name: string) {
        return this.dataSource.signup(email, password, name);
    }
}
