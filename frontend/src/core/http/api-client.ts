import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';

export abstract class HttpClient {
    protected instance: AxiosInstance;

    constructor(baseURL: string) {
        this.instance = axios.create({ baseURL });

        this.instance.interceptors.request.use((config) => {
            const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
            if (token && config.headers) {
                config.headers.Authorization = `Bearer ${token}`;
            }
            return config;
        });
    }

    protected async get<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
        const response: AxiosResponse<T> = await this.instance.get(url, config);
        return response.data;
    }

    protected async post<T>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
        const response: AxiosResponse<T> = await this.instance.post(url, data, config);
        return response.data;
    }

    protected async put<T>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
        const response: AxiosResponse<T> = await this.instance.put(url, data, config);
        return response.data;
    }

    protected async delete<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
        const response: AxiosResponse<T> = await this.instance.delete(url, config);
        return response.data;
    }
}

export const API_BASE_URL = 'http://localhost:3001/api';
