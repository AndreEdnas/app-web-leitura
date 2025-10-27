import { useEffect, useState } from 'react';
import { fetchFamilias } from '../services/api';

export default function useFamilias() {
  const [familias, setFamilias] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchFamilias()
      .then(data => setFamilias(data))
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  return { familias, loading, error };
}
