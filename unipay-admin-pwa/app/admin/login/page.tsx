'use client';

import { useRouter } from 'next/navigation';
import { AuthModal } from '@/app/components/AuthModal';

export default function AdminLoginPage() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-[#07080B] flex items-center justify-center">
      <AuthModal 
        onAuthenticated={() => {
          router.push('/');
        }} 
      />
    </div>
  );
}