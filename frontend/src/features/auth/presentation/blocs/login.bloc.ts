import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AuthDataSource } from '../../data/auth.repository';
import { AuthRepositoryImpl } from '../../data/auth.repository';

const dataSource = new AuthDataSource();
const repository = new AuthRepositoryImpl(dataSource);

export const useLoginBloc = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const router = useRouter();

    const login = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            const res = await repository.login(email, password);
            localStorage.setItem('token', res.access_token);
            router.push('/');
        } catch (err) {
            alert('Access Denied');
        } finally {
            setLoading(false);
        }
    };

    return {
        state: { email, password, loading },
        actions: { setEmail, setPassword, login }
    };
};
