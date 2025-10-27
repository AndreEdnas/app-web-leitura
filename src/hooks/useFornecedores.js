import { useEffect, useState } from 'react';
import { fetchFornecedores } from '../services/api';

export default function useFornecedores() {
  const [fornecedores, setFornecedores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchFornecedores()
      .then(data => setFornecedores(data))
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  return { fornecedores, loading, error };
}
