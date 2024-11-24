import http from 'k6/http';
import { sleep } from 'k6';

export const options = {
  vus: 50,
  duration: '30s',
};

export default function () {
  http.get('http://dot.198.19.249.2.nip.io');
  sleep(1);
}
