import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/hooks/useAuth';
import { Link } from 'react-router-dom';

export function UnauthorizedPage() {
  const { signOut, session } = useAuth();

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>No autorizado</CardTitle>
          <CardDescription>
            Esta cuenta no tiene rol admin en Lifty. Solo operadores de plataforma pueden entrar.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {session ? (
            <Button
              variant="outline"
              onClick={() => {
                void signOut();
              }}
            >
              Cerrar sesión
            </Button>
          ) : null}
          <Button asChild>
            <Link to="/login">Volver al login</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
