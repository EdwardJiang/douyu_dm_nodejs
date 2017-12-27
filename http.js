console.log('Server running');
const net = require('net');
const colors = require('colors');
// 连接斗鱼TCP配置
const douyuTcpOption = {
    port: 8601,
    host: 'openbarrage.douyutv.com'

};
// 弹幕主题颜色。
colors.setTheme({
    level0: 'white',
    level1: 'cyan',
    level2: 'green',
    level3: 'yellow',
    level4: 'magenta',
    level5: 'grey',
    level6: 'red',
    silly: 'rainbow',
    input: 'grey',
    verbose: 'cyan',
    prompt: 'red',
    info: 'green',
    data: 'blue',
    help: 'cyan',
    warn: 'yellow',
    debug: 'magenta',
    error: 'red'
});
// const roomid = 265438;//刘飞儿faye
const roomid = 2020877; //纳豆nado
// const roomid = 196;//小缘
// const roomid = 574613;//古川
// const roomid = 78561; //凌雪
// const roomid = 156277; //女流66
// const roomid = 67373; //陈一发儿

/*
发送TCP信息，依据斗鱼弹幕消息的提供的协议
*/
const sendTCPMsg = function(msg) {
    /*
    斗鱼协议有三部分组成长度，头部和数据部。
     */
    let msglength = Buffer.byteLength(msg) + 9;
    // 长度
    let len = Buffer.from([msglength, 0x00, 0x00, 0x00]);
    // 头部
    let head = Buffer.from([msglength, 0x00, 0x00, 0x00, 0xb1, 0x02, 0x00, 0x00]);
    // 数据部
    let body = Buffer.from(msg);
    // 数据部结尾以'\0'
    let tail = Buffer.from([0x00]);
    let buf = Buffer.concat([len, head, body, tail]);
    return buf;
};
/*
移除字符串最后一个字符后返回（斗鱼消息用斜杠分隔数据）
 */
const removeLastChar = function(body) {
    if (typeof body !== 'string') {
        return '';
    }
    return body.substring(0, body.length - 1);
};
// 完整数据包
let fullBuffer = Buffer.alloc(512);
// 客户端
const login = function() {
    const loginClient = net.connect(douyuTcpOption, function() {
        console.log('connected to server!');
        let msg = 'type@=loginreq/roomid@=' + roomid + '/';
        const buf = sendTCPMsg(msg)
        loginClient.write(buf);
    });
    // 数据返回时
    loginClient.on('data', function(data) {
        // 数据长度
        const bufferLength = data.length;
        // console.log(data.toString());
        // console.log('bufferLength:' + bufferLength);
        // 协议信息消息类型690
        const index = data.indexOf(Buffer.from([0xb2, 0x02, 0x00, 0x00]));
        const msgLength = data.readInt32LE(index - 4, 4);
        // console.log('msgLength:' + msgLength);
        /* 如果数据包长度和消息长度一致，直接输出弹幕信息，
        如果数据包长度和消息长度不一致代表还有数据未传递完成
        如果数据包不是完整的截取最后一个消息的长度，如果数据包的长度和最后一个消息的长度一致，表示
        这个是个完整的数据表，可进行下一步的数据处理*/
        if (bufferLength === msgLength) {
            output(data, loginClient);
        } else {
            //最后一个包
            const lastIndex = data.lastIndexOf(Buffer.from([0xb2, 0x02, 0x00, 0x00]));
            const lastMsgLength = data.readInt32LE(lastIndex - 4, 4);
            const calBufferLength = lastIndex - 4 + lastMsgLength; //计算出的buffer长度
            // console.log('lastIndex:' + lastIndex)
            // console.log('lastMsgLength:' + lastMsgLength)
            // console.log('calBufferLength:' + calBufferLength)
            // console.log('======================' + (bufferLength === calBufferLength))
            if (bufferLength === calBufferLength) {
                fullBuffer = Buffer.concat([fullBuffer, data]);
                //清空
                output(fullBuffer, loginClient);
                // console.log('dddd'+fullBuffer.toString());
                fullBuffer = Buffer.alloc(512);
            } else { //中间的包
                fullBuffer = Buffer.concat([fullBuffer, data]);
                // data.copy(fullBuffer);
            }

        }

    });
    loginClient.on('error', function(error) {
        console.log('loginClient error:' + error.stack);
    });
};

/*
获取弹幕信息
 */
const getChatMsg = function(data) {
    let chatMsgIndex = data.indexOf('type@=chatmsg');
    // 如果搜索到数据进行截取操作，不然就退出
    if (chatMsgIndex !== -1) {
        // 消息，昵称，弹幕内容，粉丝牌子名称，粉丝牌子等级，弹幕颜色，截断消息后的数据索引,截断后的数据
        let msg, snick, content, bnn, bl, col, txtColor, dataIndex, newData;
        //一个数据的长度，斗鱼协议头存储数据长度。
        let chatMsgLength = data.readInt32LE(chatMsgIndex - 8, 4);
        let tmpMsg = Buffer.alloc(data.length);
        data.copy(tmpMsg);
        // 截断一个完整的协议信息。
        msg = tmpMsg.slice(chatMsgIndex - 12, chatMsgIndex + chatMsgLength - 8).toString();
        // 获取信息数据
        snick = msg.match(/nn@=(.*?)\//g)[0].replace('nn@=', ''); //昵称
        content = msg.match(/txt@=(.*?)\//g)[0].replace('txt@=', ''); //弹幕内容
        bnn = msg.match(/bnn@=(.*?)\//g)[0].replace('bnn@=', ''); //徽章名称
        bl = msg.match(/bl@=(.*?)\//g)[0].replace('bl@=', ''); //徽章等级
        txtColor = getChatMsgColor(msg); // 弹幕颜色
        // console.log('txtColor' + txtColor[txtColor])
        console.log('[' + removeLastChar(bl) + '|' + removeLastChar(bnn) + ']' + removeLastChar(snick) + ':' + removeLastChar(content)[txtColor]);
        /* 从上一聊天消息结束标志，截断到数据包结尾，进行下一轮聊天消息截取 */
        dataIndex = chatMsgIndex + chatMsgLength - 8;
        newData = data.slice(dataIndex, data.length);
        if (newData.length > 0) {
            getChatMsg(newData);
        } else {
            return;
        }
    } else {
        return;
    }
};
/*获取弹幕消息颜色*/
const getChatMsgColor = function(msg) {
    let txtColor;
    if (msg.match(/col@=(.*?)\//g)) {
        col = msg.match(/col@=(.*?)\//g)[0].replace('col@=', ''); //弹幕颜色
        // console.log('----------col:' + col);
        switch (removeLastChar(col)) {
            case '2':
                txtColor = 'level1';
                break;
            case '3':
                txtColor = 'level2';
                break;
            case '4':
                txtColor = 'level3';
                break;
            case '5':
                txtColor = 'level4';
                break;
            case '6':
                txtColor = 'level5';
                break;
            case '7':
                txtColor = 'level6';
                break;
            default:
                txtColor = 'level0';
                break;
        }
        // console.log('----------txtColor:' + txtColor);
    } else {
        txtColor = 'level0';
    }
    return txtColor;
};
/*
    输出
 */
const output = function(data, loginClient) {
    // console.log(data.readInt32LE(0,4).toString());
    // console.log(data.toString());
    // 处理登录情况
    if (data.indexOf('type@=loginres') >= 0) {
        // 发送心跳包
        setInterval(function() { keepAlive(loginClient) }, 40000);
        // 加入分组
        join(loginClient);
    } else if (data.indexOf('type@=chatmsg') >= 0) { // 分组包含聊天信息时，处理
        if (true) {
            try {
                getChatMsg(data);

            } catch (err) {
                console.log('======error start======');
                console.log('chatmsg error data:' + data.red);
                console.log('chatmsg error:' + err.stack);
                console.log('======error end======');
            }
        }
    } else if (data.indexOf('type@=dgb') >= 0) { // 礼物消息
        let msg = data.toString(),
            snick, gifId, gifName;
        if (false) {
            try {
                snick = msg.match(/nn@=(.*?)\//g)[0].replace('nn@=', '');
                gifId = msg.match(/gfid@=(.*?)\//g)[0].replace('gfid@=', '');
                // console.log(gifId);
                switch (removeLastChar(gifId)) {
                    case '191':
                        gifName = '鱼丸';
                        console.log(snick + ':' + gifName);
                        break;
                    case '192':
                        gifName = '赞';
                        break;
                    case '193':
                        gifName = '弱鸡';
                        break;
                    case '519':
                        gifName = '';
                        break;
                    case '520':
                        gifName = '稳';
                        break;
                    case '713':
                        gifName = '辣眼睛';
                        break;
                    case '714':
                        gifName = '怂';
                        // console.log(snick + ':' + gifName);
                        break;
                    case '824':
                        gifName = '荧光棒'; //7
                        break;
                    case '1027':
                        gifName = '';
                        break;
                    case '1113':
                        gifName = '吃鸡';
                        break;
                    case '1331':
                        gifName = '？？？';
                        break;
                    case '1187':
                        gifName = '真男人';
                        break;
                    case '1191':
                        gifName = '盛典星光';
                        break;
                    case '1027':
                        gifName = '药丸';
                        break;

                    case '750':
                        gifName = '办卡';
                        console.log(snick + ':' + gifName);
                        break;
                    case '195':
                        gifName = '飞机';
                        console.log(snick + ':' + gifName);
                        break;
                    case '1115':
                        gifName = '火箭';
                        console.log(snick + ':' + gifName);
                        break;
                    case '1005':
                        gifName = '超级火箭';
                        console.log(snick + ':' + gifName);
                        break;
                    default:
                        gifName = '识别不了';
                        // console.log(snick + ':' + gifId + gifName);
                        break;
                }
                // console.log(snick + ':' + gifName);
            } catch (err) {
                console.log('======error start======');
                console.log('dgb error data:' + data);
                console.log('dgb error:' + err);
                console.log('======error end======');
            }
        }
    }

};

/* 加入分组 */
const join = function(socket) {
    console.log('joinClient connected to server!');
    let msg = 'type@=joingroup/rid@=' + roomid + '/gid@=-9999/'
    const buf = sendTCPMsg(msg)
    socket.write(buf);
};
/*
心跳信息
 */
const keepAlive = function(socket) {
    console.log('keepAlive connected to server!');
    let msg = 'type@=mrkl/'
    const buf = sendTCPMsg(msg)
    socket.write(buf);
};

login();
