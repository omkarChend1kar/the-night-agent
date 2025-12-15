import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AuthDataSource, AuthRepositoryImpl } from '../../data/auth.repository';

const dataSource = new AuthDataSource();
const repository = new AuthRepositoryImpl(dataSource);

export const useSignupBloc = () => {
    const [email, setEmail] = useState('');
    const [name, setName] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const router = useRouter();

    const signup = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        try {
            await repository.signup(email, password, name);
            router.push('/login');
        } catch (err: any) {
            const msg = err.response?.data?.message || err.message || 'Signup failed';
            setError(Array.isArray(msg) ? msg[0] : msg);
        } finally {
            setLoading(false);
        }
    };

    return {
        state: { email, name, password, loading, error },
        actions: { setEmail, setName, setPassword, signup }
    };
};
