import Hashids from 'hashids'
const hashids = new Hashids('Airhorn.events', 6);

export function encode(number: number){
    return hashids.encode(number);
}

export function decode(id: string){
    return hashids.decode(id);
}

