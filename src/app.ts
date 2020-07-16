import logger, { ELogType } from './logger_base';

async function main(){
    for(let i = 0; i < 100; i++){
        logger.debug(ELogType.Db, `This is log test ${i}`);
    }
}
main();